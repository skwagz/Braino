# Run and deploy Braino

Braino's web server runs on Node.js 24. The initial deployment supports one
durable server with per-user Google logins. SQLite holds sessions, scan previews
and the move journal; Google tokens are encrypted in separate user records.
It is not a stateless service: do not use ephemeral disks or multiple replicas.

## Local backend

```sh
npm ci
npm run start
```

Check http://127.0.0.1:43821/health. The server serves the dashboard and API after `npm run build`. Live mode is the
default and refuses startup without Google OAuth, the token key and OpenRouter
credentials. Set `BRAINO_MODE=demo` explicitly for offline development only.

## Configure live access once

1. Follow the developer setup in [Google login](google-login.md): create a
   Google Cloud project, enable Drive and Sheets APIs, configure the consent
   screen and test users, then create a **Web application** OAuth client.
2. For local web use, register exactly
   `http://127.0.0.1:43821/oauth/callback`. The web app starts authorization at
   `/auth/google/start` and handles the callback itself. Do not run the CLI
   `npm run auth -- login` concurrently: it uses the same port and a separate
   single-account token store.
3. Run `npm run auth -- init` to prepare `.env` and generate a random
   `BRAINO_TOKEN_KEY`. Keep the resulting 64-character hex key stable. Fill in
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` locally.
4. Create an API key in your OpenRouter API account and put it in `.env` as
   `OPENROUTER_API_KEY`. Set `OPENROUTER_MODEL` to a model available to your project;
   the default is `openai/gpt-4o-mini`. Semantic classification sends selected document
   content to the API and can incur usage charges.
5. Add `BRAINO_MODE=live` and
   `BRAINO_BASE_URL=http://127.0.0.1:43821` to `.env`, restart `npm run start`,
   after configuration. The dashboard handles session initialization, CSRF and
   Google login. Tokens and client/API secrets stay in the backend.

The Google grant includes `openid`, `email` and full `drive` access because
Braino organizes existing files. Choosing a folder constrains Braino's scan,
not the OAuth grant. Google classifies full Drive access as restricted; public
availability requires the applicable verification work. See
[Drive scope requirements](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
Registered callback URIs must exactly match the callback the app sends; see
[Google's web server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## Container

The Docker files are optional local deployment scaffolding and are not included
in this backend push. The following commands apply only if that scaffolding is
added separately; use `npm start` for the checked-in backend.

With Docker Engine running:

```sh
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:43821/health
```

Compose reads the listed settings from the local `.env` or shell. It publishes
only the loopback port. The image runs as the `node` user and copies only
runtime source and package manifests. Secrets, local reports and
private data are excluded from the build context. The `braino-data` named
volume preserves web state across container replacement. Do not use
`docker compose down --volumes` on an instance whose data you need.

The health endpoint checks that the server responds; it does not prove Google
credentials, model access or Drive permissions are valid. Verify those with
a dedicated test folder before demonstrating a live run.

## Hosted single instance

Deploy the image on one durable host. Supply secrets through the host's secret
configuration, keep a persistent volume at `/app/private-data/web`, and bind
the application internally on `0.0.0.0:43821`.

Configure an HTTPS reverse proxy with a certificate for your public origin.
Set `BRAINO_BASE_URL=https://YOUR_DOMAIN` and register
`https://YOUR_DOMAIN/oauth/callback` on the Google OAuth client. Preserve the
public Host header to the backend. Expose only the proxy publicly; keep the
application port private. The supplied Compose file does not install or
configure a proxy, DNS or TLS. Cookie security follows the configured HTTPS
origin. Do not trust arbitrary forwarded headers to choose the public origin.

| Setting | Purpose |
| --- | --- |
| `BRAINO_MODE` | `live` by default; `demo` is opt-in for development |
| `BRAINO_BASE_URL` | Exact browser origin; HTTPS for hosted use |
| `BRAINO_HOST` | Bind address; local default `127.0.0.1`, container `0.0.0.0` |
| `PORT` | Listening port, default `43821` |
| `BRAINO_DATA_DIR` | Persistent web state, local default `private-data/web` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google web OAuth client |
| `BRAINO_TOKEN_KEY` | Stable 64-hex encryption key for saved Google tokens |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Server-side semantic classifier configuration |

## Operations and recovery

- Restrict filesystem access to the data volume. Tokens are encrypted, but
  previews and journals can contain private document information. Protect
  backups too, and keep the encryption key separate from the backup archive.
- Stop the service before taking a filesystem backup of the entire data
  directory so the SQLite database and its journal files form a consistent
  snapshot. Restore the whole directory and the matching encryption key.
- Wait for active scans and applies to finish before planned container stops.
  Shutdown drains jobs, which can exceed Docker's default stop timeout. A
  forced stop can leave a partial run and `server.lock` in the data directory.
  If startup reports the lock after a crash, first verify that no process or
  container is still using that directory. Back up the directory, then remove
  only its stale `server.lock` and restart. Inspect any interrupted run and
  Drive before creating a new preview; never remove a live server's lock.
- Monitor HTTP failures, failed scans and failed apply runs. Avoid logging
  OAuth callback query strings, request bodies or raw document content.
- A Drive apply is a sequence of moves, not a transaction. After a failure,
  inspect the run journal and the actual Drive folder, then scan again. Do not
  blindly replay an old preview. A move may have completed just before a
  network failure; partial success must be checked against Drive.
- For rollout, test the offline flow, then a dedicated live test folder before
  adding users. For application rollback, stop the service and redeploy the
  previous image with its compatible data backup and the same secrets. A code
  rollback does not undo Drive moves; restore original parents manually using
  the journal if required.
- This is an initial single-instance backend. Multi-host locking, distributed
  workers, production retention policies and managed observability remain
  additional deployment work.

Real OAuth, paid model calls and a hosted deployment require user-provided
credentials and hosting configuration; offline tests cannot validate them.

## Production startup

Set `NODE_ENV=production`, `BRAINO_MODE=live` and an HTTPS `BRAINO_BASE_URL`.
Startup rejects demo mode, HTTP origins and missing live credentials. Run
`npm run build` before starting. Set the extension `config.js` backend origin to
that same public HTTPS origin before distribution. The checked-in localhost
address is for local use and is not a hosted service. Verify Google sign-in,
OpenRouter classification and an approved apply with a test folder before launch.
