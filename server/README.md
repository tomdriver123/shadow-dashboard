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

## Queue verdicts

`POST /api/feedback/jobs/verdict` is a zero dependency endpoint on this same API. It receives `{ id, verdict }` where `verdict` is `liked` or `passed`. The id must match `^[a-z0-9][a-z0-9-]{0,63}$`; the request body is capped at 4 KB.

The route finds the matching job id in `vault/projects/job-hunt-sabrina/digest/queue.md` using the same row matching rule as the voice server handler. When found, it updates column 10 (status) to the verdict and writes the file using the atomic temp then rename pattern. Then it runs `node dashboard/scripts/generate-career-data.js --person sabrina` and waits for completion.

Responses:
- 404 when the id is not found in the queue ledger.
- 400 for malformed body or invalid id/verdict.
- 200 on success, with `{ ok:true, id, verdict }`.
- 200 with a warning field if the ledger was updated but the generator failed (the ledger is truth; the next regen heals).

No `author` field is accepted. The ledger path is hardcoded: that is the security model. Tom's identical thumbs still post to the voice server on port 18790 instead.

The health response includes `queue: <path to sabrina queue.md>` so clients know the ledger exists.
