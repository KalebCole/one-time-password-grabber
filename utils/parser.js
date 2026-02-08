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
 * Strong context keywords — high confidence the nearby number is a code
 */
const STRONG_CONTEXT_KEYWORDS = [
  'verification code',
  'your code',
  'code is',
  'otp',
  'one-time',
  'one time',
  'passcode',
  'security code',
  'authentication code',
  'login code',
  'sign-in code',
  'confirmation code',
  'pin code',
  'access code'
];

/**
 * Weak context keywords — suggestive but not conclusive
 */
const WEAK_CONTEXT_KEYWORDS = [
  'code',
  'enter',
  'use',
  'verify',
  'submit',
  'input',
  'type',
  'is:'
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
  /\b(\d{5})\b/,

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
  /\$\d+(?:\.\d{2})?/,

  // 9+ digit strings (tracking IDs, template IDs)
  /\b\d{9,}\b/,

  // CSS values that survive stripping (e.g. 12px, 16em)
  /\b\d+(?:px|em|rem|pt|vh|vw|%)\b/i,

  // Hex color codes
  /#[0-9a-fA-F]{3,8}\b/
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
 * Score the context around a code candidate.
 * Checks ALL occurrences of the code in the text and returns the best score.
 * @param {string} text - Full text
 * @param {string} code - Extracted code
 * @returns {number} 0 = no context, 1 = weak, 2 = strong
 */
function scoreContext(text, code) {
  const lowerText = text.toLowerCase();
  const lowerCode = code.toLowerCase();
  let bestScore = 0;

  // Find all occurrences of the code in the text
  let searchFrom = 0;
  while (searchFrom < lowerText.length) {
    const codeIndex = lowerText.indexOf(lowerCode, searchFrom);
    if (codeIndex === -1) break;

    // Check for context keywords within 80 chars before the code
    const contextBefore = lowerText.slice(Math.max(0, codeIndex - 80), codeIndex);

    for (const keyword of STRONG_CONTEXT_KEYWORDS) {
      if (contextBefore.includes(keyword)) {
        return 2; // Can't do better than strong — return immediately
      }
    }

    for (const keyword of WEAK_CONTEXT_KEYWORDS) {
      if (contextBefore.includes(keyword)) {
        bestScore = Math.max(bestScore, 1);
      }
    }

    searchFrom = codeIndex + lowerCode.length;
  }

  return bestScore;
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
 * Extract verification code from email using scored candidate ranking.
 * Collects all candidate numbers, scores them on context and pattern quality,
 * and returns the highest-scoring candidate.
 * @param {Object} email - Email object with subject, body, from fields
 * @returns {Object|null} { code: string } or null if no code found
 */
export function extractVerificationCode(email) {
  const { subject, body } = email;

  // Combine subject and body for searching
  const fullText = `${subject || ''} ${body || ''}`;

  // First check: does this look like an OTP email?
  if (!containsOtpKeywords(fullText)) {
    return null;
  }

  const subjectText = (subject || '').toLowerCase();

  // Collect all candidates: { code, score }
  const candidates = [];

  for (let patternIndex = 0; patternIndex < CODE_PATTERNS.length; patternIndex++) {
    const pattern = CODE_PATTERNS[patternIndex];
    const globalPattern = new RegExp(pattern, 'gi');
    const matches = fullText.match(globalPattern);

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

      // Skip purely alphabetic matches from the alphanumeric pattern
      if (/^[A-Z]+$/.test(cleanCode)) {
        continue;
      }

      // Score this candidate
      let score = 0;

      // Context score (0, 1, or 2)
      const contextScore = scoreContext(fullText, code);
      score += contextScore * 10; // Weight context heavily

      // Pattern specificity bonus: explicit "code is: XXX" pattern (index 0) gets extra points
      if (patternIndex === 0) {
        score += 15;
      }

      // 6-digit codes are most common for verification — slight bonus
      if (/^\d{6}$/.test(cleanCode)) {
        score += 3;
      }

      // Bonus if code appears in subject line (subjects are more concise)
      if (subjectText.includes(code.toLowerCase())) {
        score += 5;
      }

      // Explicit labeling bonus: "code is: XXX" or "code: XXX" immediately before
      const labelPattern = new RegExp(
        `(?:code|otp|pin|passcode)\\s*(?:is|:)\\s*:?\\s*${cleanCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      );
      if (labelPattern.test(fullText)) {
        score += 20;
      }

      candidates.push({ code: cleanCode, score, contextScore });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Deduplicate: keep the highest score for each unique code
  const bestByCode = new Map();
  for (const c of candidates) {
    const existing = bestByCode.get(c.code);
    if (!existing || c.score > existing.score) {
      bestByCode.set(c.code, c);
    }
  }

  // Sort by score descending
  const ranked = [...bestByCode.values()].sort((a, b) => b.score - a.score);

  // Require at least weak context (score >= 1) unless it matched explicit labeling (score >= 15)
  const best = ranked[0];
  if (best.contextScore >= 1 || best.score >= 15) {
    return { code: best.code };
  }

  return null;
}
