# Verification Code Grabber

A Chrome extension that automatically detects verification codes from Gmail and copies them to your clipboard with one click.

## Features

- **Background polling** - Checks Gmail every minute for new verification codes
- **Smart detection** - Uses keyword matching + regex to find OTP codes
- **One-click copy** - Auto-copies to clipboard when you click the extension
- **Badge notification** - Shows a dot when a new code is available

## Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Verification Code Grabber")
3. Enable the **Gmail API**:
   - Go to APIs & Services > Library
   - Search for "Gmail API"
   - Click Enable

### 2. Configure OAuth Consent Screen

1. Go to APIs & Services > OAuth consent screen
2. Select "External" user type
3. Fill in the required fields:
   - App name: "Verification Code Grabber"
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `.../auth/gmail.readonly`
5. Add your email as a test user

### 3. Create OAuth Client ID

1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Chrome Extension" as application type
4. Enter your extension ID (get it after loading the extension)
5. Copy the Client ID

### 4. Update manifest.json

Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` in `manifest.json` with your actual Client ID.

### 5. Add Icons

Create or download icons in these sizes and place them in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can use any icon generator or create simple ones with a lock/key symbol.

### 6. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `verification-code-grabber` folder
5. Note your extension ID and update the OAuth Client ID in Google Cloud Console

## Usage

1. Click the extension icon to sign in with Google
2. Grant Gmail read-only access
3. When you receive a verification code email, the extension badge will show a dot
4. Click the extension to see the code - it auto-copies to your clipboard!
5. Click "Dismiss" to clear the current code

## How It Works

1. **Polling**: Service worker checks Gmail every 60 seconds
2. **Detection**: Looks for emails with keywords like "verification", "OTP", "code"
3. **Extraction**: Uses regex patterns to find 4-8 digit codes
4. **Storage**: Saves the most recent code in Chrome storage
5. **Badge**: Shows a green dot when a new code is available
6. **Popup**: Displays the code and auto-copies on first open

## Privacy

- Only requests `gmail.readonly` scope (can't send or modify emails)
- All processing happens locally in your browser
- No external servers or data collection
- Codes are only stored temporarily in Chrome's local storage

## Development

```
verification-code-grabber/
├── manifest.json           # Extension config
├── service-worker.js       # Background polling
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── utils/
│   ├── gmail-api.js       # Gmail API helpers
│   └── parser.js          # Code extraction
└── icons/
```

## License

MIT
