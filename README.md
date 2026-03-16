# 🔓 Verification Code Grabber

A Chrome extension that grabs verification codes from Gmail and SMS, keeps a history, and auto-fills them right into the page. No more tab-switching, squinting at emails, or fumbling with your phone.

> _"Adding a new device shouldn't feel like defusing a bomb."_

---

## ✨ What It Does

| Feature | Description |
|---------|-------------|
| 🔍 **Smart Detection** | Scans Gmail and SMS for verification codes using keyword + regex matching |
| 📋 **One-Click Copy** | Code ready on your clipboard the moment you open the popup |
| 🤖 **Auto-Fill** | Detects OTP fields on any page and offers to fill them — no paste needed |
| 🗂️ **Code History** | Rolling list of your last 10 codes, so dismissed codes aren't gone forever |
| 📦 **Archive & Dismiss** | Clean up verification emails after use |
| 🟢 **Badge Notification** | Green dot when a fresh code is waiting |
| 📱 **SMS Relay** | Pulls codes from your phone via a local SMS relay |

---

## 🚀 How It Works

```
📧 Gmail / 📱 SMS
     ↓
  Service worker polls every 60s
     ↓
  Detects code → stores it → badge lights up
     ↓
  ┌─────────────────────────────────┐
  │  Popup: see code, copy, archive │
  │  History: last 10 codes         │
  └─────────────────────────────────┘
     ↓
  Content script spots OTP field on page
     ↓
  ┌──────────────────────────┐
  │  "621971"  [Fill]  [×]   │  ← Shadow DOM popover
  └──────────────────────────┘
     ↓
  Fills input, dispatches events (React/Vue compatible)
```

---

## 🎯 Auto-Fill Detection

The content script identifies OTP fields using these heuristics (in priority order):

1. `autocomplete="one-time-code"` — W3C standard
2. `name` / `id` matching OTP patterns (`otp`, `mfa`, `2fa`, `verification-code`, etc.)
3. `placeholder` containing "code", "OTP", "digit", "PIN"
4. `type="tel"` or `type="number"` with `maxlength` 4-8
5. `inputmode="numeric"` with `maxlength` 4-8
6. **Split-digit inputs** — 4-8 adjacent `input[maxlength="1"]` elements

Works on Google, GitHub, banks, and pretty much any site with an OTP field.

---

## 🛠️ Setup

<details>
<summary><strong>1. Google Cloud Project</strong></summary>

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the **Gmail API** (APIs & Services > Library)
4. Configure OAuth consent screen (External, add `gmail.modify` scope, add yourself as test user)
5. Create OAuth client ID (type: Chrome Extension, enter your extension ID)
6. Copy the Client ID into `manifest.json` under `oauth2.client_id`
</details>

<details>
<summary><strong>2. Load the Extension</strong></summary>

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder
4. Note the extension ID and update it in Google Cloud Console
</details>

<details>
<summary><strong>3. SMS Relay (optional)</strong></summary>

For SMS code detection, run the SMS relay server on a Mac connected to your phone's Messages database. The extension connects via Tailscale at the address configured in `manifest.json` host permissions.
</details>

---

## 📂 Project Structure

```
verification-code-grabber/
├── manifest.json            # Extension config + permissions
├── service-worker.js        # Background polling, code history, message handlers
├── content/
│   └── autofill.js          # OTP field detection + Shadow DOM popover + fill
├── popup/
│   ├── popup.html           # Popup layout with history section
│   ├── popup.css            # Dark theme styles
│   └── popup.js             # Popup logic, history rendering, copy/archive
├── utils/
│   ├── gmail-api.js         # Gmail API helpers (fetch, archive)
│   ├── parser.js            # Verification code extraction
│   └── sms-api.js           # SMS relay client
└── icons/
```

---

## 🔒 Privacy

- **Local only** — all processing happens in your browser
- **No external servers** — no data collection, no analytics
- **Minimal scope** — `gmail.modify` (read + archive, cannot send or delete)
- **Codes are ephemeral** — stored temporarily in Chrome local storage

---

## 📜 License

MIT
