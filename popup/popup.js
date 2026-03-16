// UI Elements
const states = {
  loading: document.getElementById('loading'),
  authRequired: document.getElementById('auth-required'),
  noCode: document.getElementById('no-code'),
  codeAvailable: document.getElementById('code-available'),
  smsOffline: document.getElementById('sms-offline'),
  error: document.getElementById('error-state')
};

const elements = {
  sourceTabs: document.getElementById('source-tabs'),
  header: document.getElementById('header'),
  checkNowBtn: document.getElementById('check-now-btn'),
  lastChecked: document.getElementById('last-checked'),
  loadingText: document.getElementById('loading-text'),
  authBtn: document.getElementById('auth-btn'),
  codeValue: document.getElementById('code-value'),
  codeFrom: document.getElementById('code-from'),
  codeTime: document.getElementById('code-time'),
  copyBtn: document.getElementById('copy-btn'),
  copyStatus: document.getElementById('copy-status'),
  copyArchiveBtn: document.getElementById('copy-archive-btn'),
  clearBtn: document.getElementById('clear-btn'),
  retryBtn: document.getElementById('retry-btn'),
  smsRetryBtn: document.getElementById('sms-retry-btn'),
  errorMessage: document.getElementById('error-message'),
  historySection: document.getElementById('history-section'),
  historyToggle: document.getElementById('history-toggle'),
  historyList: document.getElementById('history-list'),
  historyArrow: document.querySelector('.history-arrow'),
  clearHistory: document.getElementById('clear-history')
};

let isChecking = false;
let currentMessageId = null;
let activeSource = 'gmail'; // 'gmail' or 'sms'

// Show a specific state, hide others
function showState(stateName) {
  Object.entries(states).forEach(([name, el]) => {
    el.classList.toggle('hidden', name !== stateName);
  });
}

// Show/hide header (visible when authenticated or on SMS tab)
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

// Update the action button label based on source
function updateActionButton() {
  const btnText = elements.copyArchiveBtn.querySelector('.btn-text');
  if (activeSource === 'sms') {
    btnText.textContent = 'Copy & Dismiss';
  } else {
    btnText.textContent = 'Copy & Archive';
  }
}

// --- Tab switching ---

function switchTab(source) {
  activeSource = source;

  // Update tab UI
  elements.sourceTabs.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.source === source);
  });

  // Save preference
  chrome.storage.local.set({ activeSource: source });

  // Update action button label
  updateActionButton();

  // Load content for the selected tab
  if (source === 'gmail') {
    initGmail();
  } else {
    initSms();
  }
}

// --- Gmail flow ---

async function initGmail() {
  try {
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

    showHeader(true);

    const result = await chrome.storage.local.get(['currentCode', 'lastPollTimestamp']);

    if (result.lastPollTimestamp) {
      elements.lastChecked.textContent = `Last checked: ${formatRelativeTime(result.lastPollTimestamp)}`;
    }

    if (result.currentCode && result.currentCode.code) {
      displayCode(result.currentCode);
    } else {
      elements.loadingText.textContent = 'Checking Gmail...';
      showState('loading');
      await checkNowGmail();
    }
  } catch (err) {
    console.error('Gmail init error:', err);
    showState('error');
    elements.errorMessage.textContent = err.message || 'Something went wrong';
  }
}

async function checkNowGmail() {
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
    loadHistory();
  } catch (err) {
    console.error('Gmail check error:', err);
    showState('error');
    elements.errorMessage.textContent = err.message || 'Failed to check Gmail';
  } finally {
    setCheckingState(false);
  }
}

// --- SMS flow ---

async function initSms() {
  showHeader(true);
  elements.loadingText.textContent = 'Checking SMS...';
  showState('loading');
  await checkNowSms();
}

async function checkNowSms() {
  if (isChecking) return;
  setCheckingState(true);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_SMS_NOW', sinceMinutes: 60 });
    updateLastChecked();

    if (response?.error) {
      // Show offline state for connection errors
      showState('smsOffline');
      return;
    }

    if (response?.code) {
      displayCode(response.code);
    } else {
      showState('noCode');
    }
    loadHistory();
  } catch (err) {
    console.error('SMS check error:', err);
    showState('smsOffline');
  } finally {
    setCheckingState(false);
  }
}

// --- Check Now dispatcher ---

function checkNow() {
  if (activeSource === 'sms') {
    checkNowSms();
  } else {
    checkNowGmail();
  }
}

// --- Display + actions ---

async function displayCode(codeData) {
  const { code, from, subject, timestamp, messageId, copied } = codeData;

  currentMessageId = messageId || null;

  elements.codeValue.textContent = code;
  elements.codeFrom.textContent = from || subject || 'Unknown sender';
  elements.codeTime.textContent = formatRelativeTime(timestamp);

  // Update action button state
  updateActionButton();
  if (activeSource === 'sms') {
    elements.copyArchiveBtn.disabled = false;
    elements.copyArchiveBtn.title = '';
  } else {
    elements.copyArchiveBtn.disabled = !currentMessageId;
    elements.copyArchiveBtn.title = currentMessageId ? '' : 'Archive unavailable for this code';
  }

  showState('codeAvailable');
  elements.copyStatus.textContent = '';
}

async function markCurrentCodeCopied() {
  if (activeSource !== 'gmail') return;
  const { currentCode } = await chrome.storage.local.get(['currentCode']);
  if (currentCode) {
    await chrome.storage.local.set({ currentCode: { ...currentCode, copied: true } });
  }
}

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
    markCurrentCodeCopied();

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

// Set loading state on action button
function setArchivingState(archiving) {
  const btn = elements.copyArchiveBtn;
  if (!btn) return;

  const btnText = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');

  btn.disabled = archiving;
  if (spinner) spinner.classList.toggle('hidden', !archiving);
  if (btnText) {
    if (archiving) {
      btnText.textContent = 'Archiving...';
    } else {
      btnText.textContent = activeSource === 'sms' ? 'Copy & Dismiss' : 'Copy & Archive';
    }
  }
}

async function handleCopyAndAction() {
  const code = elements.codeValue.textContent;

  // Copy to clipboard
  const copySuccess = await copyToClipboard(code);

  if (copySuccess) {
    elements.copyStatus.textContent = 'Copied to clipboard!';
    elements.copyStatus.classList.remove('error', 'warning');
    markCurrentCodeCopied();
  } else {
    elements.copyStatus.textContent = 'Copy failed';
    elements.copyStatus.classList.add('error');
    return;
  }

  // Source-specific action
  if (activeSource === 'sms') {
    // SMS has no archive/mark-read — just dismiss after copy
    elements.copyStatus.textContent = 'Copied!';
    setTimeout(() => showState('noCode'), 1500);
  } else {
    await handleArchive();
  }
}

async function handleArchive() {
  if (!currentMessageId) {
    elements.copyStatus.textContent = 'Copied! (Archive unavailable)';
    elements.copyStatus.classList.add('warning');
    return;
  }

  setArchivingState(true);

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'ARCHIVE_EMAIL',
      messageId: currentMessageId,
    });

    if (result.success) {
      elements.copyStatus.textContent = 'Copied & archived!';
      elements.copyStatus.classList.remove('error', 'warning');

      setTimeout(async () => {
        await chrome.storage.local.remove(['currentCode']);
        await chrome.action.setBadgeText({ text: '' });
        showState('noCode');
      }, 1500);
    } else {
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

async function handleClear() {
  if (activeSource === 'gmail') {
    await chrome.storage.local.remove(['currentCode']);
    await chrome.action.setBadgeText({ text: '' });
  }
  showState('noCode');
}

async function handleAuth() {
  const response = await chrome.runtime.sendMessage({ type: 'AUTH_REQUEST' });
  if (response?.success) {
    initGmail();
  } else {
    showState('error');
    elements.errorMessage.textContent = response?.error || 'Authentication failed';
  }
}

function handleRetry() {
  if (activeSource === 'sms') {
    initSms();
  } else {
    initGmail();
  }
}

// --- History ---

let historyExpanded = false;

async function loadHistory() {
  const { codeHistory = [] } = await chrome.storage.local.get(['codeHistory']);

  if (codeHistory.length === 0) {
    elements.historySection.classList.add('hidden');
    return;
  }

  elements.historySection.classList.remove('hidden');
  renderHistory(codeHistory);
}

function renderHistory(history) {
  elements.historyList.innerHTML = '';

  for (const entry of history) {
    const item = document.createElement('div');
    item.className = 'history-item';

    const fromLabel = entry.from || 'Unknown';
    const truncatedFrom = fromLabel.length > 20
      ? fromLabel.substring(0, 20) + '...'
      : fromLabel;

    const codeSpan = document.createElement('span');
    codeSpan.className = 'history-code';
    codeSpan.textContent = entry.code;

    const fromSpan = document.createElement('span');
    fromSpan.className = 'history-from';
    fromSpan.textContent = truncatedFrom;

    const sourceSpan = document.createElement('span');
    sourceSpan.className = 'history-source';
    sourceSpan.textContent = entry.source || 'gmail';

    const timeSpan = document.createElement('span');
    timeSpan.textContent = formatRelativeTime(entry.timestamp);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'history-info';
    infoDiv.append(sourceSpan, timeSpan);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'history-meta';
    metaDiv.append(fromSpan, infoDiv);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'history-copy-btn';
    copyBtn.dataset.code = entry.code;
    copyBtn.textContent = 'Copy';

    item.append(codeSpan, metaDiv, copyBtn);
    elements.historyList.appendChild(item);
  }

  // Show/hide clear link
  elements.clearHistory.classList.toggle('hidden', !historyExpanded);
}

function toggleHistory() {
  historyExpanded = !historyExpanded;
  elements.historyList.classList.toggle('hidden', !historyExpanded);
  elements.historyArrow.classList.toggle('expanded', historyExpanded);
  elements.clearHistory.classList.toggle('hidden', !historyExpanded);
}

async function handleHistoryCopy(e) {
  const btn = e.target.closest('.history-copy-btn');
  if (!btn) return;

  const code = btn.dataset.code;
  const success = await copyToClipboard(code);

  if (success) {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1500);
  }
}

async function handleClearHistory() {
  await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
  elements.historySection.classList.add('hidden');
  elements.historyList.innerHTML = '';
}

// --- Initialization ---

async function init() {
  // Restore active tab preference
  const { activeSource: saved } = await chrome.storage.local.get(['activeSource']);
  if (saved === 'sms' || saved === 'gmail') {
    activeSource = saved;
  }

  // Set initial tab state
  elements.sourceTabs.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.source === activeSource);
  });

  // Load content
  if (activeSource === 'sms') {
    initSms();
  } else {
    initGmail();
  }

  // Load history
  loadHistory();
}

// --- Event listeners ---

elements.authBtn.addEventListener('click', handleAuth);
elements.checkNowBtn.addEventListener('click', checkNow);
elements.copyBtn.addEventListener('click', handleCopy);
elements.copyArchiveBtn.addEventListener('click', handleCopyAndAction);
elements.clearBtn.addEventListener('click', handleClear);
elements.retryBtn.addEventListener('click', handleRetry);
elements.smsRetryBtn.addEventListener('click', initSms);

// Tab click handlers
elements.sourceTabs.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.source));
});

// History event listeners
elements.historyToggle.addEventListener('click', toggleHistory);
elements.historyList.addEventListener('click', handleHistoryCopy);
elements.clearHistory.addEventListener('click', (e) => {
  e.preventDefault();
  handleClearHistory();
});

init();
