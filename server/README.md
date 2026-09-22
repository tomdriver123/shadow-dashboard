# Feedback API

A tiny zero dependency Node server behind the dashboard's Feedback tab. It
lets the page write feedback about the dashboard itself, text plus
screenshots, as files in the vault. There is no agent in the loop and no
chat, just one way writes from the page to disk. The storage contract
(entry format, folders, status vocabulary) lives in
`vault/feedback/README.md`.

`npm start` runs `scripts/dev.js`, which starts both `ng serve` and this
API together. `npm run start:web` runs `ng serve` alone, and
`npm run start:api` runs this API alone, for when you only need one of
them.

The Feedback page talks to `/api/feedback` as a same origin, relative URL.
Angular's dev server proxies that path to this API using `proxyConfig` in
`angular.json`, pointed at `proxy.conf.json`. That is also why the phone
path works with no extra setup: the existing `tailscale serve` on port
4200 fronts `ng serve`, and the proxy rides along with it.

A bare `ng serve` (without `proxyConfig` wired up) or a production
`ng build` has no API behind it. In either case the Feedback page shows
its offline banner and keeps entries on the device (IndexedDB, synced
later) until the API is reachable again.

The dev server must be restarted after editing `angular.json` or
`proxy.conf.json`. Changes to the proxy configuration are read once at
startup, so a stale `ng serve` will keep 404ing `/api/feedback` and the
page will sit in offline mode, which looks like a bug but is not.

The voice server on port 18790 is unrelated to this API and is not touched
by it.

Do not pass `--host 0.0.0.0` to `npm start`: `tailscale serve` already holds the tailscale IP on port 4200 and proxies it to localhost, so the wildcard bind collides while plain `npm start` (localhost) works and the phone still reaches it.
