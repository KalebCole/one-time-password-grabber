(() => {
  'use strict';

  // Skip extension and internal pages
  const proto = window.location.protocol;
  if (proto === 'chrome-extension:' || proto === 'chrome:' || proto === 'about:') return;

  const OTP_NAME_RE = /otp|verif.*code|mfa|2fa|passcode|pin.?code|security.?code/i;
  const OTP_PLACEHOLDER_RE = /\bcode\b|\bOTP\b|\bdigit\b|\bPIN\b/i;
  const POPOVER_TIMEOUT_MS = 10000;
  const SCAN_DEBOUNCE_MS = 500;

  let activePopover = null;
  let activeInput = null;
  let activeAnchor = null;
  let activePopoverEl = null;
  let scanTimeout = null;

  // --- OTP Field Detection ---

  function isOtpInput(el) {
    if (el.tagName !== 'INPUT') return false;
    if (el.type === 'hidden' || el.type === 'password') return false;

    // 1. W3C standard
    if (el.autocomplete === 'one-time-code') return true;

    // 2. Name/ID heuristic
    if (OTP_NAME_RE.test(el.name || '') || OTP_NAME_RE.test(el.id || '')) return true;

    // 3. Placeholder heuristic
    if (OTP_PLACEHOLDER_RE.test(el.placeholder || '')) return true;

    // 4. Numeric input with maxlength 4-8
    const ml = parseInt(el.maxLength, 10);
    if ((el.type === 'tel' || el.type === 'number') && ml >= 4 && ml <= 8) return true;

    // 5. inputmode="numeric" with maxlength 4-8
    if (el.inputMode === 'numeric' && ml >= 4 && ml <= 8) return true;

    return false;
  }

  function groupByAncestor(inputs, getAncestor) {
    const groups = new Map();
    for (const input of inputs) {
      const ancestor = getAncestor(input);
      if (!ancestor) continue;
      if (!groups.has(ancestor)) groups.set(ancestor, []);
      groups.get(ancestor).push(input);
    }
    for (const [, group] of groups) {
      if (group.length >= 4 && group.length <= 8) return group;
    }
    return null;
  }

  function findSplitDigitInputs() {
    const candidates = document.querySelectorAll('input[maxlength="1"]');
    if (candidates.length < 4) return null;

    // Try parent grouping first, then grandparent (common: each input wrapped in a div)
    return groupByAncestor(candidates, (el) => el.parentElement)
      || groupByAncestor(candidates, (el) => el.parentElement?.parentElement);
  }

  function findOtpFields() {
    const fields = [];

    // Check standard OTP inputs
    const allInputs = document.querySelectorAll('input');
    for (const input of allInputs) {
      if (isOtpInput(input) && isVisible(input)) {
        fields.push({ type: 'single', element: input });
      }
    }

    // Check split-digit pattern
    const splitInputs = findSplitDigitInputs();
    if (splitInputs && splitInputs.every(isVisible)) {
      fields.push({ type: 'split', elements: splitInputs });
    }

    return fields;
  }

  function isVisible(el) {
    if (!el.offsetParent && el.style.position !== 'fixed') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // --- Shadow DOM Popover ---

  function createPopover(code, anchorEl) {
    removePopover();

    const host = document.createElement('div');
    host.id = 'vcg-autofill-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .vcg-popover {
          position: fixed;
          z-index: 2147483647;
          background: #1a1a2e;
          border: 1px solid #4f46e5;
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #eee;
          animation: vcg-fadein 0.15s ease;
        }
        @keyframes vcg-fadein {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .vcg-code {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 2px;
          color: #00d9ff;
        }
        .vcg-fill-btn {
          background: #4f46e5;
          color: white;
          border: none;
          border-radius: 5px;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }
        .vcg-fill-btn:hover {
          background: #4338ca;
        }
        .vcg-dismiss {
          background: none;
          border: none;
          color: #666;
          font-size: 16px;
          cursor: pointer;
          padding: 2px 6px;
          line-height: 1;
        }
        .vcg-dismiss:hover {
          color: #aaa;
        }
      </style>
      <div class="vcg-popover">
        <span class="vcg-code">${escapeHtml(code)}</span>
        <button class="vcg-fill-btn">Fill</button>
        <button class="vcg-dismiss">&times;</button>
      </div>
    `;

    document.body.appendChild(host);

    // Position below the anchor input
    const popoverEl = shadow.querySelector('.vcg-popover');
    positionPopover(popoverEl, anchorEl);

    // Event handlers
    shadow.querySelector('.vcg-fill-btn').addEventListener('click', () => {
      fillCode(code);
      removePopover();
    });
    shadow.querySelector('.vcg-dismiss').addEventListener('click', removePopover);

    activePopover = host;
    activeAnchor = anchorEl;
    activePopoverEl = popoverEl;

    // Reposition on scroll/resize
    const reposition = () => {
      if (activePopover === host) positionPopover(popoverEl, anchorEl);
    };
    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition, { passive: true });
    host._cleanup = () => {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
    };

    // Auto-dismiss after timeout
    setTimeout(() => {
      if (activePopover === host) {
        removePopover();
      }
    }, POPOVER_TIMEOUT_MS);
  }

  function positionPopover(popoverEl, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // Flip above if overflowing bottom
    if (rect.bottom + 6 + popRect.height > vh && rect.top - 6 - popRect.height > 0) {
      popoverEl.style.top = `${rect.top - 6 - popRect.height}px`;
    } else {
      popoverEl.style.top = `${rect.bottom + 6}px`;
    }

    // Shift left if overflowing right
    const left = Math.min(rect.left, vw - popRect.width - 8);
    popoverEl.style.left = `${Math.max(8, left)}px`;
  }

  function removePopover() {
    if (activePopover) {
      if (activePopover._cleanup) activePopover._cleanup();
      activePopover.remove();
      activePopover = null;
      activeAnchor = null;
      activePopoverEl = null;
    }
  }

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // --- Fill Logic ---

  // Use native setter to work with React/Vue controlled inputs
  const nativeValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  )?.set;

  function setInputValue(input, value) {
    if (nativeValueSetter) {
      nativeValueSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillCode(code) {
    if (!activeInput) return;

    if (activeInput.type === 'split') {
      fillSplitDigits(activeInput.elements, code);
    } else {
      fillSingleInput(activeInput.element, code);
    }

    activeInput = null;
  }

  function fillSingleInput(input, code) {
    setInputValue(input, code);
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function fillSplitDigits(inputs, code) {
    const digits = code.split('');

    for (let i = 0; i < inputs.length && i < digits.length; i++) {
      setInputValue(inputs[i], digits[i]);
    }

    const focusIdx = Math.min(digits.length, inputs.length) - 1;
    if (focusIdx >= 0) {
      inputs[focusIdx].dispatchEvent(new Event('blur', { bubbles: true }));
      inputs[focusIdx].focus();
    }
  }

  // --- Core Logic ---

  async function getCurrentCode() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_CODE' });
      return response?.code || null;
    } catch {
      // Extension context invalidated or not available
      return null;
    }
  }

  async function scanAndOffer() {
    const fields = findOtpFields();
    if (fields.length === 0) return;

    const code = await getCurrentCode();
    if (!code) return;

    // Use the first detected field
    const field = fields[0];
    activeInput = field;

    const anchor = field.type === 'split' ? field.elements[0] : field.element;
    createPopover(code, anchor);
  }

  function debouncedScan() {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanAndOffer, SCAN_DEBOUNCE_MS);
  }

  // --- Initialization ---

  // Initial scan
  scanAndOffer();

  // Watch for dynamically added inputs (SPAs)
  const observer = new MutationObserver((mutations) => {
    let hasNewInputs = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.tagName === 'INPUT' || node.querySelector?.('input')) {
          hasNewInputs = true;
          break;
        }
      }
      if (hasNewInputs) break;
    }
    if (hasNewInputs && !activePopover) {
      debouncedScan();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Also scan when an input gains focus (catches cases where inputs exist but weren't detected yet)
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName !== 'INPUT' || activePopover) return;
    if (!isOtpInput(e.target)) return;

    getCurrentCode().then((code) => {
      if (code) {
        activeInput = { type: 'single', element: e.target };
        createPopover(code, e.target);
      }
    });
  });
})();
