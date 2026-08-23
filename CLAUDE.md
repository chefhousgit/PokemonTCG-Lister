# PokemonTCG-Lister — agent notes

## Shape

Copy Field Service Companion conventions:

- CommonJS `server.js`, `routes/` HTTP, `routes/utils/` pure logic
- Session auth, inline HTML login, `/api/health` before auth
- Vite client in `client/`, open the app at `:3001`
- `node --test` with an explicit file list in root `package.json`

## Deliberate deviation from FSC

FSC has no database. This app uses Postgres (`DATABASE_URL` on Railway). Locally, if `DATABASE_URL` is unset, `routes/utils/db.js` boots **PGlite** under `.data/pglite`. Same SQL migrations.

## PTCGPB boundary

- Parse files at rest under `Accounts/Cards/` only.
- **Never read, walk, copy, or log `Accounts/Saved/`** — plaintext usernames/passwords.
- Do not fork, vendor, or invoke `PTCGPB.ahk`.
- Do not call PTCGPB's localhost dashboard HTTP API.
- Job payloads carry `account_key` / instance / friend ID only. `assertSafeJobPayload` runs on the server and the agent.

## Paths per computer

Users set PTCGPB folders in the **Settings** UI (`ptcgpb_paths`). Do not require a single `PTCGPB_ROOT` env var. Railway cannot see `C:\` — upload JSON or run the local agent on the machine that has the folder.

## Interfaces

- Marketplace: `mock` | `manual` | stub `eldorado` (`ELDORADO_ENABLED`).
- Executor: `manual` | `stub` | optional external plugin path. Do not build emulator automation in this repo.

## Tests

After adding a `*.test.js`, append it to the root `test` script.
