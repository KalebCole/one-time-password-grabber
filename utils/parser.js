/**
 * Keywords that indicate a verification/OTP email
 */
const OTP_KEYWORDS = [
  'verification code',
  'verify code',
  'verification',
  'code is',
  'your code',
  'security code',
  'one-time',
  'one time',
  'otp',
  '2fa',
  'two-factor',
  'two factor',
  'authentication code',
  'login code',
  'sign-in code',
  'signin code',
  'confirm',
  'confirmation code',
  'passcode',
  'pin code',
  'access code'
];

/**
 * Context keywords that should appear near the code
 */
const CONTEXT_KEYWORDS = [
  'code',
  'is:',
  'is ',
  'enter',
  'use',
  'verify',
  'submit',
  'input',
  'type',
  ':'
];

/**
 * Patterns to extract verification codes
 * Order matters - more specific patterns first
 */
const CODE_PATTERNS = [
  // Explicit "code is: 123456" patterns
  /(?:code|otp|pin|passcode)\s*(?:is|:)\s*[:\s]*([A-Z0-9]{4,8})/i,

  // 6-digit numeric (most common)
  /\b(\d{6})\b/,

  // 4-digit numeric
  /\b(\d{4})\b/,

  // 8-digit numeric
  /\b(\d{8})\b/,

  // 5-digit numeric
  /\b(\d{5})\b,/,

  // 7-digit numeric
  /\b(\d{7})\b/,

  // Alphanumeric codes (6-8 chars, at least one letter and one number)
  /\b([A-Z0-9]{6,8})\b/i,

  // Codes with dashes (123-456)
  /\b(\d{3}-\d{3})\b/,

  // Codes with spaces (123 456)
  /\b(\d{3}\s\d{3})\b/
];

/**
 * Patterns to exclude (false positives)
 */
const EXCLUDE_PATTERNS = [
  // Phone numbers
  /\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,

  // Dates (various formats)
  /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,

  // Times
  /\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?/,

  // Years
  /\b(19|20)\d{2}\b/,

  // Order/Reference numbers (usually longer or have specific prefixes)
  /(?:order|ref|reference|tracking|invoice|po|#)\s*[:#]?\s*\d+/i,

  // Postal codes
  /\b\d{5}(?:-\d{4})?\b/,

  // Currency amounts
  /\$\d+(?:\.\d{2})?/
];

/**
 * Check if text contains OTP keywords
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function containsOtpKeywords(text) {
  const lowerText = text.toLowerCase();
  return OTP_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

/**
 * Check if code appears in valid context
 * @param {string} text - Full text
 * @param {string} code - Extracted code
 * @returns {boolean}
 */
function isValidContext(text, code) {
  const lowerText = text.toLowerCase();
  const codeIndex = lowerText.indexOf(code.toLowerCase());

  if (codeIndex === -1) return false;

  // Check for context keywords within 50 chars before the code
  const contextBefore = lowerText.slice(Math.max(0, codeIndex - 50), codeIndex);

  return CONTEXT_KEYWORDS.some((keyword) => contextBefore.includes(keyword.toLowerCase()));
}

/**
 * Check if code matches exclusion patterns
 * @param {string} text - Full text containing the code
 * @param {string} code - Extracted code
 * @returns {boolean}
 */
function isExcluded(text, code) {
  // Check if the code is part of excluded patterns
  for (const pattern of EXCLUDE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.some((match) => match.includes(code))) {
      return true;
    }
  }

  // Additional checks
  // All same digits (like 000000)
  if (/^(\d)\1+$/.test(code)) {
    return true;
  }

  // Sequential digits (like 123456)
  if (isSequential(code)) {
    return true;
  }

  return false;
}

/**
 * Check if string is sequential numbers
 * @param {string} str - String to check
 * @returns {boolean}
 */
function isSequential(str) {
  if (!/^\d+$/.test(str)) return false;

  const digits = str.split('').map(Number);
  let ascending = true;
  let descending = true;

  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[i - 1] + 1) ascending = false;
    if (digits[i] !== digits[i - 1] - 1) descending = false;
  }

  return ascending || descending;
}

/**
 * Extract verification code from email
 * @param {Object} email - Email object with subject, body, from fields
 * @returns {Object|null} { code: string } or null if no code found
 */
export function extractVerificationCode(email) {
  const { subject, body, from } = email;

  // Combine subject and body for searching
  const fullText = `${subject || ''} ${body || ''}`;

  // First check: does this look like an OTP email?
  if (!containsOtpKeywords(fullText)) {
    return null;
  }

  // Try each pattern
  for (const pattern of CODE_PATTERNS) {
    const matches = fullText.match(new RegExp(pattern, 'gi'));

    if (!matches) continue;

    for (const match of matches) {
      // Extract the capture group (the actual code)
      const codeMatch = match.match(pattern);
      const code = codeMatch ? (codeMatch[1] || codeMatch[0]) : match;

      // Clean up the code
      const cleanCode = code.replace(/[-\s]/g, '').toUpperCase();

      // Skip if excluded
      if (isExcluded(fullText, cleanCode)) {
        continue;
      }

      // Check context (code should appear near relevant keywords)
      if (isValidContext(fullText, code)) {
        return { code: cleanCode };
      }
    }
  }

  // Fallback: if we found OTP keywords, try a more aggressive numeric extraction
  const numericMatch = fullText.match(/\b(\d{4,8})\b/);
  if (numericMatch) {
    const code = numericMatch[1];
    if (!isExcluded(fullText, code) && code.length >= 4) {
      return { code };
    }
  }

  return null;
}
