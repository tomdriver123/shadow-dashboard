# Shadow Dashboard

A personal dashboard that reads a Markdown vault and shows it on a phone. Habits, finances, a job hunt pipeline, interview prep, an agent roster, and a feedback inbox, each tab fed by a generator that turns Markdown tables and YAML frontmatter into JSON. Built as the front end of a personal AI agent system, then opened up as a reference for the pattern.

The vault is private and is not in this repo. The app runs against a sample vault out of the box.

## How it fits together

```
Markdown vault  -->  scripts/generate-*-data.js  -->  src/assets/data/*.json  -->  Angular pages
                      scripts/refresh.js (orchestrator, one target per tab)
                      server/vault-api.js (127.0.0.1:4201: serves the build, the JSON, and the /api routes that write back to the vault)
```

- **Vault in, JSON out.** Every page renders whatever its JSON says. Nothing personal is hardcoded; names, dates and labels all come from the vault.
- **One orchestrator.** `scripts/refresh.js <target>` runs the upstream sync for a target (when it has one) and then its generator. launchd timers, the API's refresh routes and the refresh buttons in the UI all call the same script.
- **Write-back through the API.** Quiz attempts, feedback entries and queue verdicts are appended to vault Markdown atomically, then the affected JSON is regenerated.
- **Generated JSON is never committed.** `src/assets/data/` is gitignored; `npm run sample` fills it from the committed sample set.

## Stack

Angular 20, Ionic 8, Capacitor 8, TypeScript 5.9, NgModules, SCSS, Leaflet for the map pages, ngx-markdown for rendered answers. A single-file Node API server with zero npm dependencies.

## Run it

```bash
npm ci
npm run sample     # copies sample JSON into src/assets/data/
npm start          # API on 127.0.0.1:4201 plus ng serve on http://localhost:4200
```

Other scripts: `npm run build` (to `www/`), `npm test` (Karma and Jasmine), `npm run test:scripts` (node:test for the generators and the API), `npm run lint`.

## Point it at your own vault

| Variable | Default | Purpose |
|---|---|---|
| `SHADOW_ROOT` | in-tree parent, else `~/shadow` | Root of the vault repo. An explicitly set but invalid path is an error, never a silent fallback |
| `SHADOW_VAULT_DIR` | `$SHADOW_ROOT/vault` | The vault itself |
| `SHADOW_DATA_DIR` | `src/assets/data` | Where generated JSON is written and served from |
| `SHADOW_STATIC_DIR` | `www` | Built app served by the API; empty disables static serving |
| `VAULT_API_PORT` | `4201` | API port |

The vault layout the generators expect is documented at the top of each `scripts/generate-*-data.js`, and `scripts/test/fixtures/sample-vault/` is a complete, invented example of it.

## Layout

```
src/app/pages/      agents, brain, career, feedback, habits, home, voice (one tab each)
src/app/services/   one fetcher per JSON file, plus the quiz and feedback outboxes
scripts/            refresh.js, the generators, lib/shadow-paths.js, tests and fixtures
server/             vault-api.js and its README (every route, every path it touches)
sample-data/        committed JSON for `npm run sample`
```

## Phone access

The API binds localhost. For a phone, front it with something that terminates TLS, for example `tailscale serve --https=4200 http://127.0.0.1:4201`, and open the HTTPS URL.

## License

MIT
