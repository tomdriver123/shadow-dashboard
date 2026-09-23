# Vault API

A tiny zero dependency Node server behind the dashboard. It lets the
Feedback tab write feedback about the dashboard itself, text plus
screenshots, as files in the vault. There is no agent in the loop and no
chat, just one way writes from the page to disk. The storage contract
(entry format, folders, status vocabulary) lives in
`vault/feedback/README.md`. The same process also logs quiz attempts,
carries Sabrina's job queue verdicts, and runs the dashboard's data
refresh pipeline through `dashboard/scripts/refresh.js`. See the Refresh
section below.

`npm start` runs `scripts/dev.js`, which starts both `ng serve` and this
API together. `npm run start:web` runs `ng serve` alone, and
`npm run start:api` runs this API alone, for when you only need one of
them.

The dashboard talks to this API at `/api/...` as a same origin, relative
URL. Angular's dev server proxies that path to this API using
`proxyConfig` in `angular.json`, pointed at `proxy.conf.json`. The proxy
is now a single bare `/api` context covering every route this file
serves, so a new route here never needs a matching proxy edit. That is
also why the phone path works with no extra setup: the existing
`tailscale serve` on port 4200 fronts `ng serve`, and the proxy rides
along with it.

A bare `ng serve` (without `proxyConfig` wired up) or a production
`ng build` has no API behind it. In either case the Feedback page shows
its offline banner and keeps entries on the device (IndexedDB, synced
later) until the API is reachable again.

The dev server must be restarted after editing `angular.json` or
`proxy.conf.json`. Changes to the proxy configuration are read once at
startup, so a stale `ng serve` will keep 404ing `/api/...` and the page
will sit in offline mode, which looks like a bug but is not.

The voice server on port 18790 is unrelated to this API and is not touched
by it.

Do not pass `--host 0.0.0.0` to `npm start`: `tailscale serve` already holds the tailscale IP on port 4200 and proxies it to localhost, so the wildcard bind collides while plain `npm start` (localhost) works and the phone still reaches it.

This server binds `PORT = 4201` by default. Set `VAULT_API_PORT` to
override it; the older `FEEDBACK_API_PORT` name still works as a
fallback when `VAULT_API_PORT` is unset, for anything that still sets it.

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

## Refresh

`GET /api/health` (alias `GET /api/feedback/health`, kept for anything still calling the old path) returns the existing fields plus `refreshTargets` (the whitelist below) and `running` (the targets currently mid refresh).

`GET /api/refresh/status` returns `{ ok, state, running, data }`. `state` is the parsed contents of `dashboard/src/assets/data/refresh.json` as `dashboard/scripts/refresh.js` last wrote it, or `{ generatedAt: null, targets: {} }` if that file is missing or unreadable. `running` is the list of targets this process currently has a refresh in flight for. `data` has one entry per generated file, `{ generatedAt, mtime }`: `generatedAt` comes from the JSON file's own `generatedAt` field, falling back to `null` when the file is missing, unreadable, or (in the case of `agents.json`, which is a bare array with no such field) not an object; `mtime` is the file's last modified time, or `null` if the file does not exist. A page can use `generatedAt` when present and fall back to `mtime` otherwise.

`POST /api/refresh/:target` starts one refresh and waits for it to finish. `target` must be one of `finance`, `habits`, `career`, `jobs`, `brain`, `agents`, `all`; anything else is a 400. Query parameters:
- `?sync=` controls whether the target's upstream sync step runs (Plaid, habits) before the generator. `1` or `true` turns it on, anything else turns it off. Left unset, it defaults on for `finance`, `habits`, and `all`, and off for everything else.
- `?person=` is passed through to the `career` generator (`tom` or `sabrina`); any other value is a 400.

If the target, `all`, or (when the target is `all`) anything at all is already running, the route returns 409 with `{ ok:false, target, error:'a refresh is already running', running }` and starts nothing new.

Otherwise it shells out to `node dashboard/scripts/refresh.js <target> --json ...` and waits, capped at a 180 second timeout. A refresh that completes, even if one of its steps failed, still returns 200 with the orchestrator's one JSON object: `{ ok, target, targets: { <target>: { lastRun, ok, durationMs, error, warnings, synced, person?, steps } } }`. `ok:false` on that body means a non optional step failed; the `steps` array's `tail` fields are the whole point of returning 200 here instead of collapsing a partial failure to a bare error, since the page needs those tails to show what broke. A 500 only happens when the child process could not be run at all or its stdout was not parseable JSON, and the response is `{ ok:false, target, error }` where `error` is a timeout message if the process was killed for running past 180 seconds, or the child's stderr otherwise.

Every refresh route reuses this file's existing `execFileAsync` and `sendJson` helpers; there is no second copy of either.
