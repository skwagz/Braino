# Connect Google Drive

Braino now supports Google account consent and automatic token refresh. This is
a local, single-account development flow. Google handles the password and consent
screen. The organizer uses the saved login automatically.

## One-time developer setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select your
   project. Enable **Google Drive API** and **Google Sheets API**.
2. Configure the OAuth consent screen in Google Auth Platform. Set the app name
   to Braino and supply the required support/developer contact fields. For a demo,
   keep the audience in Testing and add each demo account as a test user.
3. Add the `openid`, `email`, and `https://www.googleapis.com/auth/drive` scopes.
   Full Drive access is requested because this product moves existing documents.
   It is broader than the folder selected in Braino: our code enforces the folder
   boundary, while the token has the access shown on Google's consent screen.
4. Create an OAuth client of type **Web application**. Register this exact
   **Authorized redirect URI**:

   ```text
   http://127.0.0.1:43821/oauth/callback
   ```

5. Run the following commands in the project:

   ```sh
   npm install
   npm run auth -- init
   ```

6. Open the generated `.env` locally. Fill in `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` with the values from that OAuth client. Leave the
   generated `BRAINO_TOKEN_KEY` unchanged. Do not paste secrets into chat or Git.

If `.env` already exists, init preserves it and adds a key only when the key
setting is absent. Add missing client settings using `.env.example` as a reference.
If a key line exists but is empty, remove that empty line and rerun init before
saving any login. The redirect URI in `.env` must exactly match Google Cloud.

## Login and organize

```sh
npm run auth -- login
```

Open the local link printed in the terminal. Choose your account on Google's
page and approve access. The browser then shows a connection confirmation.
The terminal reports the connected email. You never copy an access token.

```sh
npm run auth -- status
npm run organize -- preview YOUR_FOLDER_ID first-preview.json
```

Read the assignments and operations in `private-data/first-preview.json`. When
ready to move the originals, use:

```sh
npm run organize -- apply first-preview.json
```

To revoke Google's grant and remove the saved local login:

```sh
npm run auth -- logout
```

Login replaces this checkout's saved account; status displays that account but
does not perform a remote permission check. Do not log in/out concurrently with
an organizer run. Remove the optional `GOOGLE_ACCESS_TOKEN` developer override
from `.env` to use saved-login authentication and automatic refresh.

## Security and deployment boundary

- The callback listens only on `127.0.0.1`. It requires the expected Host, a
  one-use random OAuth state, a browser cookie and PKCE. The ID token's signature,
  audience and nonce are checked using Google's official authentication library.
- Refresh tokens and access tokens are AES-256-GCM encrypted in
  `private-data/google-login.enc`; the encryption key is in `.env`. Both paths
  are ignored by Git. Protect both with your user account's filesystem permissions;
  encryption does not protect against someone who can read both files. Do not
  sync these secrets to shared storage or commit them.
- The saved token is refreshed near expiry. Revoked or expired grants require
  login again. No refresh token is sent to the UI. The Google client secret stays
  in the local Node process, which serves as the development backend.
- A public multi-user service needs HTTPS callbacks, authenticated per-user
  sessions, isolated encrypted token records, production secret management and
  appropriate Google verification. Do not expose this loopback server publicly.
- Google testing-mode grants can expire sooner than production grants; a demo
  account may need to reconnect. Full Drive is a restricted scope, so public
  launch has additional verification requirements.

## Troubleshooting

- `redirect_uri_mismatch`: register the exact URI above; `localhost` and
  `127.0.0.1` are different redirect strings.
- `access_denied`: check consent and test-user membership, then run login again.
- Port in use: finish the earlier login or configure a different loopback port
  in both `.env` and Google Cloud.
- Decryption error: restore the matching `.env` encryption key. If the login is
  no longer needed, remove only `private-data/google-login.enc` and reconnect.
- Token refresh fails: reconnect. Confirm that the OAuth client still exists.
- Certificate trust errors on a managed Windows machine: use the trusted OS
  certificate store (`NODE_OPTIONS=--use-system-ca`) where appropriate; do not
  disable TLS certificate verification.

References: [Google's web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
