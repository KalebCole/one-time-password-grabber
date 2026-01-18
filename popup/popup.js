// UI Elements
const states = {
  loading: document.getElementById('loading'),
  authRequired: document.getElementById('auth-required'),
  noCode: document.getElementById('no-code'),
  codeAvailable: document.getElementById('code-available'),
  error: document.getElementById('error-state')
};

const elements = {
  header: document.getElementById('header'),
  checkNowBtn: document.getElementById('check-now-btn'),
  lastChecked: document.getElementById('last-checked'),
  authBtn: document.getElementById('auth-btn'),
  codeValue: document.getElementById('code-value'),
  codeFrom: document.getElementById('code-from'),
  codeTime: document.getElementById('code-time'),
  copyBtn: document.getElementById('copy-btn'),
  copyStatus: document.getElementById('copy-status'),
  copyArchiveBtn: document.getElementById('copy-archive-btn'),
  clearBtn: document.getElementById('clear-btn'),
  retryBtn: document.getElementById('retry-btn'),
  errorMessage: document.getElementById('error-message')
};

let isChecking = false;
let currentMessageId = null;

// Show a specific state, hide others
function showState(stateName) {
  Object.entries(states).forEach(([name, el]) => {
    el.classList.toggle('hidden', name !== stateName);
  });
}

// Show/hide header (visible when authenticated)
function showHeader(show) {
  elements.header.classList.toggle('hidden', !show);
}

// Set loading state on Check Now button
function setCheckingState(checking) {
  isChecking = checking;
  const btn = elements.checkNowBtn;
  const refreshIcon = btn.querySelector('.refresh-icon');
  const spinner = btn.querySelector('.spinner');
  const btnText = btn.querySelector('.btn-text');

  btn.disabled = checking;
  refreshIcon.classList.toggle('hidden', checking);
  spinner.classList.toggle('hidden', !checking);
  btnText.textContent = checking ? 'Checking...' : 'Check Now';
}

// Update last checked timestamp
function updateLastChecked() {
  elements.lastChecked.textContent = `Last checked: just now`;
}

// Format relative time
function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Copy code to clipboard
async function copyToClipboard(code) {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch (err) {
    console.error('Clipboard write failed:', err);
    return false;
  }
}

// Check Now - fetch Gmail immediately
async function checkNow() {
  if (isChecking) return;

  setCheckingState(true);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_NOW' });

    updateLastChecked();

    if (response?.error) {
      if (response.error === 'No auth token') {
        showHeader(false);
        showState('authRequired');
      } else {
        showState('error');
        elements.errorMessage.textContent = response.error;
      }
      return;
    }

    if (response?.code) {
      displayCode(response.code);
    } else {
      showState('noCode');
    }
  } catch (err) {
    console.error('Check now error:', err);
    showState('error');
    elements.errorMessage.textContent = err.message || 'Failed to check Gmail';
  } finally {
    setCheckingState(false);
  }
}

// Display a code in the UI
async function displayCode(codeData) {
  const { code, from, subject, timestamp, messageId, copied } = codeData;

  // Store messageId for archive functionality
  currentMessageId = messageId || null;

  elements.codeValue.textContent = code;
  elements.codeFrom.textContent = from || subject || 'Unknown sender';
  elements.codeTime.textContent = formatRelativeTime(timestamp);

  // Disable archive button if no messageId (old stored codes)
  if (elements.copyArchiveBtn) {
    elements.copyArchiveBtn.disabled = !currentMessageId;
    if (!currentMessageId) {
      elements.copyArchiveBtn.title = 'Archive unavailable for this code';
    } else {
      elements.copyArchiveBtn.title = '';
    }
  }

  showState('codeAvailable');

  // Auto-copy if not already copied
  if (!copied) {
    const success = await copyToClipboard(code);
    if (success) {
      elements.copyStatus.textContent = 'Auto-copied to clipboard!';
      // Mark as copied in storage
      chrome.storage.local.get(['currentCode'], (result) => {
        if (result.currentCode) {
          chrome.storage.local.set({
            currentCode: { ...result.currentCode, copied: true }
          });
        }
      });
    }
  } else {
    elements.copyStatus.textContent = '';
  }
}

// Handle copy button click
async function handleCopy() {
  const code = elements.codeValue.textContent;
  const success = await copyToClipboard(code);

  const codeDisplay = document.querySelector('.code-display');
  const copyIcon = elements.copyBtn.querySelector('.copy-icon');
  const checkIcon = elements.copyBtn.querySelector('.check-icon');

  if (success) {
    elements.copyStatus.textContent = 'Copied to clipboard!';
    elements.copyStatus.classList.remove('error');
    codeDisplay.classList.add('copied');
    copyIcon.classList.add('hidden');
    checkIcon.classList.remove('hidden');

    // Mark as copied in storage
    chrome.storage.local.get(['currentCode'], (result) => {
      if (result.currentCode) {
        chrome.storage.local.set({
          currentCode: { ...result.currentCode, copied: true }
        });
      }
    });

    setTimeout(() => {
      codeDisplay.classList.remove('copied');
      copyIcon.classList.remove('hidden');
      checkIcon.classList.add('hidden');
    }, 2000);
  } else {
    elements.copyStatus.textContent = 'Copy failed - click to try again';
    elements.copyStatus.classList.add('error');
  }
}

// Archive email via service worker
async function archiveEmail(messageId) {
  const response = await chrome.runtime.sendMessage({
    type: 'ARCHIVE_EMAIL',
    messageId
  });
  return response;
}

// Set loading state on Copy & Archive button
function setArchivingState(archiving) {
  const btn = elements.copyArchiveBtn;
  if (!btn) return;

  const btnText = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');

  btn.disabled = archiving;
  if (spinner) spinner.classList.toggle('hidden', !archiving);
  if (btnText) btnText.textContent = archiving ? 'Archiving...' : 'Copy & Archive';
}

// Handle copy and archive
async function handleCopyAndArchive() {
  const code = elements.codeValue.textContent;

  // First, copy to clipboard
  const copySuccess = await copyToClipboard(code);

  if (copySuccess) {
    elements.copyStatus.textContent = 'Copied to clipboard!';
    elements.copyStatus.classList.remove('error', 'warning');

    // Mark as copied in storage
    chrome.storage.local.get(['currentCode'], (result) => {
      if (result.currentCode) {
        chrome.storage.local.set({
          currentCode: { ...result.currentCode, copied: true }
        });
      }
    });
  } else {
    elements.copyStatus.textContent = 'Copy failed';
    elements.copyStatus.classList.add('error');
    return; // Don't proceed with archive if copy failed
  }

  // Then, archive the email
  if (!currentMessageId) {
    elements.copyStatus.textContent = 'Copied! (Archive unavailable)';
    elements.copyStatus.classList.add('warning');
    return;
  }

  setArchivingState(true);

  try {
    const result = await archiveEmail(currentMessageId);

    if (result.success) {
      elements.copyStatus.textContent = 'Copied & archived!';
      elements.copyStatus.classList.remove('error', 'warning');

      // Clear the code and badge after successful archive
      setTimeout(async () => {
        await chrome.storage.local.remove(['currentCode']);
        await chrome.action.setBadgeText({ text: '' });
        showState('noCode');
      }, 1500);
    } else {
      // Archive failed but copy succeeded
      if (result.error === 'Permission denied - please re-authenticate') {
        elements.copyStatus.textContent = 'Copied! Archive failed - please sign out and back in';
      } else {
        elements.copyStatus.textContent = `Copied! Archive failed: ${result.error}`;
      }
      elements.copyStatus.classList.add('warning');
    }
  } catch (err) {
    elements.copyStatus.textContent = `Copied! Archive error: ${err.message}`;
    elements.copyStatus.classList.add('warning');
  } finally {
    setArchivingState(false);
  }
}

// Handle dismiss/clear
async function handleClear() {
  await chrome.storage.local.remove(['currentCode']);
  await chrome.action.setBadgeText({ text: '' });
  showState('noCode');
}

// Handle auth
async function handleAuth() {
  try {
    chrome.runtime.sendMessage({ type: 'AUTH_REQUEST' }, (response) => {
      if (response?.success) {
        init();
      } else {
        showState('error');
        elements.errorMessage.textContent = response?.error || 'Authentication failed';
      }
    });
  } catch (err) {
    showState('error');
    elements.errorMessage.textContent = 'Authentication failed';
  }
}

// Handle retry
function handleRetry() {
  init();
}

// Initialize popup
async function init() {
  try {
    // Check if we have an auth token
    const token = await new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        resolve(token);
      });
    });

    if (!token) {
      showHeader(false);
      showState('authRequired');
      return;
    }

    // Show header now that we're authenticated
    showHeader(true);

    // Check for stored code
    const result = await chrome.storage.local.get(['currentCode', 'lastPollTimestamp']);

    // Update last checked time if available
    if (result.lastPollTimestamp) {
      elements.lastChecked.textContent = `Last checked: ${formatRelativeTime(result.lastPollTimestamp)}`;
    }

    if (result.currentCode && result.currentCode.code) {
      // Code exists - just display it (no auto-fetch)
      displayCode(result.currentCode);
    } else {
      // No code stored - auto-check immediately
      showState('loading');
      await checkNow();
    }
  } catch (err) {
    console.error('Init error:', err);
    showState('error');
    elements.errorMessage.textContent = err.message || 'Something went wrong';
  }
}

// Event listeners
elements.authBtn.addEventListener('click', handleAuth);
elements.checkNowBtn.addEventListener('click', checkNow);
elements.copyBtn.addEventListener('click', handleCopy);
elements.copyArchiveBtn.addEventListener('click', handleCopyAndArchive);
elements.clearBtn.addEventListener('click', handleClear);
elements.retryBtn.addEventListener('click', handleRetry);

// Initialize on load
init();
