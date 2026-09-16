# Braino Chrome extension

This Manifest V3 extension opens the existing Braino dashboard in a full browser
tab on installation and when you click its toolbar icon. In live mode, select
Connect Google Drive, sign in, and approve access. Google returns you to the
workspace. Existing signed-in sessions are reused by the dashboard.

## Install locally

1. Start the backend from the repository root using the root README instructions.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select this `apps/extension` directory (the folder
   containing `manifest.json`).
4. Pin Braino using Chrome's extensions menu. Click it to open your workspace.

The default server is `http://127.0.0.1:43821`. Keep it running while using the
extension. Live mode is the default. Explicit demo mode works without credentials; real Google sign-in requires the
backend's Google OAuth and OpenRouter configuration. Connecting Drive to Codex
does not authenticate Braino.

## Distribution

Set `backendOrigin` in `config.js` to your deployed HTTPS origin before packaging.
Configure the backend's base URL and Google's registered OAuth callback for that
same origin (`https://your-host/oauth/callback`). Users do not enter API keys.
After editing extension files, click **Reload** on `chrome://extensions`.

For local sharing, zip the files in this directory. Recipients extract the zip
and use **Load unpacked**. Chrome Web Store installation requires a separate store
submission and review; this source folder is not a published store extension.

## Permissions and behavior

No extension permissions or host permissions are requested. Braino does not
inject scripts into Drive, read browser tabs, or store tokens in the extension.
The backend handles Google consent, encrypted credentials, AI classification,
and approved writes. This launcher requires the backend; it does not bundle or
start a server. It opens a full tab, not a side panel or forced browser fullscreen.

## Smoke check

Install with the backend running: a workspace tab should open. Close it and click
the toolbar icon: another workspace tab should open. In demo mode, scan, edit,
apply, search, and open the sample PDF. In configured live mode, sign in with a
test account, confirm return to `/app`, and reopen via the icon to confirm the
session persists. Only apply changes to a disposable test folder during testing.
