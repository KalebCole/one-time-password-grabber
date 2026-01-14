import { fetchRecentEmails, getAuthToken } from './utils/gmail-api.js';
import { extractVerificationCode } from './utils/parser.js';

const ALARM_NAME = 'check-emails';
const POLL_INTERVAL_MINUTES = 1; // Check every minute

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

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_REQUEST') {
    handleAuthRequest().then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_NOW') {
    handleCheckNow().then(sendResponse);
    return true; // Keep channel open for async response
  }
});

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
          copied: false
        };

        // Store it
        await chrome.storage.local.set({ currentCode: codeData });

        // Show badge dot
        await chrome.action.setBadgeText({ text: '•' });
        await chrome.action.setBadgeBackgroundColor({ color: '#4ade80' });

        // Return the code to popup
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
              copied: false
            }
          });

          // Show badge dot
          await chrome.action.setBadgeText({ text: '•' });
          await chrome.action.setBadgeBackgroundColor({ color: '#4ade80' });

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

// Clear badge when popup is opened (optional - handled in popup too)
chrome.action.onClicked.addListener(() => {
  // This won't fire since we have a popup, but good to have
});

console.log('[VCG] Service worker loaded');
