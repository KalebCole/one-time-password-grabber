const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Get OAuth token using chrome.identity
 * @param {boolean} interactive - Whether to show login prompt
 * @returns {Promise<string|null>} The auth token or null
 */
export async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('[Gmail API] Auth error:', chrome.runtime.lastError.message);
        if (interactive) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(null);
        }
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Fetch recent emails from Gmail
 * @param {string} token - OAuth token
 * @param {number} since - Timestamp to fetch emails after
 * @returns {Promise<Array>} Array of email objects
 */
export async function fetchRecentEmails(token, since) {
  try {
    // Build query for recent emails
    // Gmail uses epoch seconds, not milliseconds
    const afterDate = Math.floor(since / 1000);
    const query = `after:${afterDate} in:inbox`;

    // List messages matching query
    const listUrl = `${GMAIL_API_BASE}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;

    const listResponse = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!listResponse.ok) {
      if (listResponse.status === 401) {
        // Token expired, remove it
        await revokeToken(token);
        throw new Error('Token expired');
      }
      throw new Error(`Gmail API error: ${listResponse.status}`);
    }

    const listData = await listResponse.json();

    if (!listData.messages || listData.messages.length === 0) {
      return [];
    }

    // Fetch full content for each message
    const emails = await Promise.all(
      listData.messages.map((msg) => fetchEmailContent(token, msg.id))
    );

    // Filter out nulls and sort by date (newest first)
    return emails
      .filter(Boolean)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error('[Gmail API] Fetch error:', err);
    throw err;
  }
}

/**
 * Fetch full email content by ID
 * @param {string} token - OAuth token
 * @param {string} messageId - Gmail message ID
 * @returns {Promise<Object|null>} Email object or null
 */
async function fetchEmailContent(token, messageId) {
  try {
    const url = `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error(`[Gmail API] Failed to fetch message ${messageId}`);
      return null;
    }

    const data = await response.json();

    // Extract headers
    const headers = data.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    // Extract body
    const body = extractBody(data.payload);

    return {
      id: messageId,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      timestamp: parseInt(data.internalDate, 10),
      body
    };
  } catch (err) {
    console.error(`[Gmail API] Error fetching message ${messageId}:`, err);
    return null;
  }
}

/**
 * Extract plain text body from email payload
 * @param {Object} payload - Gmail message payload
 * @returns {string} Plain text body
 */
function extractBody(payload) {
  if (!payload) return '';

  // Try to find plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Check parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }

    // If no plain text, try HTML
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64(part.body.data);
        return stripHtml(html);
      }
    }

    // Recurse into nested parts
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  // Fallback to direct body data
  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  return '';
}

/**
 * Decode base64url encoded string
 * @param {string} data - Base64url encoded data
 * @returns {string} Decoded string
 */
function decodeBase64(data) {
  try {
    // Convert base64url to base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return atob(base64);
  } catch (err) {
    console.error('[Gmail API] Base64 decode error:', err);
    return '';
  }
}

/**
 * Strip HTML tags from string
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Revoke an auth token
 * @param {string} token - Token to revoke
 */
async function revokeToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}
