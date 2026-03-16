import { fetchRecentEmails, getAuthToken, archiveEmail } from './utils/gmail-api.js';
import { extractVerificationCode } from './utils/parser.js';
import { fetchSmsVerificationCodes } from './utils/sms-api.js';

const ALARM_NAME = 'check-emails';
const POLL_INTERVAL_MINUTES = 1; // Check every minute
const MAX_HISTORY = 10;

// Append a code entry to the rolling history (max 10, deduped by code+timestamp)
async function appendToHistory(entry) {
  const { codeHistory = [] } = await chrome.storage.local.get(['codeHistory']);

  const isDupe = codeHistory.some(
    (h) => h.code === entry.code && h.timestamp === entry.timestamp
  );
  if (isDupe) return;

  const updated = [entry, ...codeHistory].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ codeHistory: updated });
}

async function showBadgeDot() {
  await chrome.action.setBadgeText({ text: '\u2022' });
  await chrome.action.setBadgeBackgroundColor({ color: '#4ade80' });
}

function buildHistoryEntry(code, from, source, timestamp) {
  return { code, from, source, timestamp };
}

// Initialize alarm on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VCG] Extension installed');
  setupAlarm();
});

// Also set up alarm on service worker start
chrome.runtime.onStartup.addListener(() => {
  console.log('[VCG] Extension started');
  setupAlarm();
});

// Set up periodic alarm
function setupAlarm() {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: POLL_INTERVAL_MINUTES
  });
  console.log(`[VCG] Alarm set for every ${POLL_INTERVAL_MINUTES} minute(s)`);

  // Also run immediately on setup
  checkForCodes();
}

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkForCodes();
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message).then(sendResponse);
    return true; // Keep channel open for async response
  }
});

const messageHandlers = {
  AUTH_REQUEST: () => handleAuthRequest(),
  CHECK_NOW: () => handleCheckNow(),
  ARCHIVE_EMAIL: (msg) => handleArchiveEmail(msg.messageId),
  CHECK_SMS_NOW: (msg) => handleCheckSms(msg.sinceMinutes),

  GET_CURRENT_CODE: async () => {
    const { currentCode } = await chrome.storage.local.get(['currentCode']);
    if (currentCode?.code) {
      return { code: currentCode.code, source: currentCode.source || 'gmail' };
    }
    return { code: null };
  },

  CLEAR_HISTORY: async () => {
    await chrome.storage.local.set({ codeHistory: [] });
    return { success: true };
  },
};

// Handle auth request from popup
async function handleAuthRequest() {
  try {
    const token = await getAuthToken(true); // interactive = true
    if (token) {
      // Trigger immediate check after auth
      await checkForCodes();
      return { success: true };
    }
    return { success: false, error: 'No token received' };
  } catch (err) {
    console.error('[VCG] Auth error:', err);
    return { success: false, error: err.message };
  }
}

// Handle CHECK_NOW request from popup - returns result directly
async function handleCheckNow() {
  console.log('[VCG] CHECK_NOW request received');

  try {
    // Get auth token (non-interactive)
    const token = await getAuthToken(false);
    if (!token) {
      return { error: 'No auth token' };
    }

    // Fetch emails from last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    const emails = await fetchRecentEmails(token, oneHourAgo);
    console.log(`[VCG] CHECK_NOW found ${emails.length} emails`);

    // Update last poll timestamp
    await chrome.storage.local.set({ lastPollTimestamp: Date.now() });

    // Check each email for verification codes (most recent first)
    for (const email of emails) {
      const result = extractVerificationCode(email);

      if (result) {
        console.log('[VCG] CHECK_NOW found code:', result.code);

        const codeData = {
          code: result.code,
          from: email.from,
          subject: email.subject,
          timestamp: email.timestamp,
          messageId: email.id,
          copied: false
        };

        await chrome.storage.local.set({ currentCode: codeData });
        await appendToHistory(buildHistoryEntry(result.code, email.from, 'gmail', email.timestamp));
        await showBadgeDot();

        return { code: codeData };
      }
    }

    // No code found
    return { code: null };
  } catch (err) {
    console.error('[VCG] CHECK_NOW error:', err);
    return { error: err.message || 'Failed to check Gmail' };
  }
}

// Handle ARCHIVE_EMAIL request from popup
async function handleArchiveEmail(messageId) {
  console.log('[VCG] ARCHIVE_EMAIL request received for:', messageId);

  if (!messageId) {
    return { success: false, error: 'No message ID provided' };
  }

  try {
    const token = await getAuthToken(false);
    if (!token) {
      return { success: false, error: 'No auth token' };
    }

    await archiveEmail(token, messageId);
    console.log('[VCG] Email archived successfully');
    return { success: true };
  } catch (err) {
    console.error('[VCG] Archive error:', err);
    return { success: false, error: err.message || 'Failed to archive email' };
  }
}

// Handle CHECK_SMS_NOW request from popup
async function handleCheckSms(sinceMinutes) {
  console.log('[VCG] CHECK_SMS_NOW request received');

  try {
    const result = await fetchSmsVerificationCodes(sinceMinutes || 60);
    const codes = result?.codes || [];

    if (codes.length > 0) {
      const latest = codes[0];
      const codeData = {
        code: latest.code,
        from: latest.from,
        timestamp: latest.timestamp,
        messageRowId: latest.messageRowId,
        source: 'sms',
        copied: false,
      };

      // Store as current code (enables auto-fill for SMS codes)
      await chrome.storage.local.set({ currentCode: codeData });

      await appendToHistory(buildHistoryEntry(latest.code, latest.from, 'sms', latest.timestamp));

      return { code: codeData };
    }

    return { code: null };
  } catch (err) {
    console.error('[VCG] CHECK_SMS_NOW error:', err);
    return { error: err.message || 'Failed to reach SMS relay' };
  }
}

// Main function to check for verification codes
async function checkForCodes() {
  console.log('[VCG] Checking for codes...');

  try {
    // Get auth token (non-interactive)
    const token = await getAuthToken(false);
    if (!token) {
      console.log('[VCG] No auth token, skipping check');
      return;
    }

    // Get last poll timestamp
    const { lastPollTimestamp } = await chrome.storage.local.get(['lastPollTimestamp']);
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const since = Math.max(lastPollTimestamp || 0, oneHourAgo);

    // Fetch recent emails
    const emails = await fetchRecentEmails(token, since);
    console.log(`[VCG] Found ${emails.length} emails to check`);

    // Update last poll timestamp
    await chrome.storage.local.set({ lastPollTimestamp: Date.now() });

    if (emails.length === 0) {
      return;
    }

    // Check each email for verification codes (most recent first)
    for (const email of emails) {
      const result = extractVerificationCode(email);

      if (result) {
        console.log('[VCG] Found verification code:', result.code);

        // Get current stored code to check if this is new
        const { currentCode } = await chrome.storage.local.get(['currentCode']);

        // Only update if this is a new code
        if (!currentCode || currentCode.code !== result.code || currentCode.timestamp !== email.timestamp) {
          // Store the new code
          await chrome.storage.local.set({
            currentCode: {
              code: result.code,
              from: email.from,
              subject: email.subject,
              timestamp: email.timestamp,
              messageId: email.id,
              copied: false
            }
          });

          await appendToHistory(buildHistoryEntry(result.code, email.from, 'gmail', email.timestamp));
          await showBadgeDot();

          console.log('[VCG] New code stored and badge updated');
        }

        // Only process the most recent matching email
        break;
      }
    }
  } catch (err) {
    console.error('[VCG] Error checking for codes:', err);
  }
}

console.log('[VCG] Service worker loaded');
