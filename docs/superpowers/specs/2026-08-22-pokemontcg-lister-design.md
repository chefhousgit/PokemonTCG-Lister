# PokemonTCG-Lister — Design Spec

**Date:** 2026-08-22  
**Status:** Ready for review (no feature code written)  
**Source brief:** `Downloads/cursor-prompt-pokemontcg-lister_1.md`  
**Workspace:** `chefhousgit/PokemonTCG-Lister` (README only)

This spec locks decisions from the brief, real account-JSON recon, and prior-art review. Implementation starts only after explicit go-ahead.

---

## 1. Product

A Railway-hosted Express + React app that manages Pokémon TCG Pocket inventory **across many in-game accounts**, publishes sell/trade listings, and dispatches resulting trades to a local Windows agent.

Day one is usable with **no PTCGPB process, no Eldorado API, and no emulator automation**. Those plug in later behind interfaces.

**ToS (once, then move on):** botting and account/item sales violate Pokémon TCG Pocket terms and risk bans. README gets a short `## Risks` section; the trade-job UI gets a warning banner.

---

## 2. Skills on disk

| Named in brief | On disk? | How we use it |
|---|---|---|
| `ui-ux-pro-max` | Yes | Accessibility, touch targets, tables, inventory-dashboard patterns |
| `frontend-design` | **No** | Not invented. Use FSC visual language + ui-ux-pro-max rules |
| `react-components` | Yes, but Stitch + TypeScript | **Does not apply.** Client is JSX, no TypeScript, no Stitch. Modular Vite + React only |

No `.cursor/rules/` in this workspace yet. Ignore resume/career skills.

---

## 3. Prior-art findings

### 3.1 Field Service Companion (`chefhousgit/field-service-companion`, `master`)

**Copy these patterns exactly:**

- Root CommonJS `server.js`, `main: server.js`, `engines.node >= 18`
- Scripts: `postinstall` → `cd client && npm install`; `build` → `cd client && npm install && npm run build`; `start` → `node server.js`; `dev` → concurrently nodemon + Vite
- `express-session` auth: `APP_PASSWORD` optional bypass, inline HTML login (not React), `POST /auth/login` urlencoded, `GET /auth/logout`, in-memory 10-fail / 15-min lockout
- Health check **before** auth: `GET /api/health`
- `trust proxy` + `secure` cookies when `NODE_ENV === production`
- Static serve when `client/dist/index.html` exists (not `NODE_ENV` alone)
- Vite proxy `/api` → `:3001`; open the app at **`:3001`**, not `:5173`
- `routes/` HTTP + `routes/utils/` pure logic + colocated `*.test.js`
- `node --test` with an **explicit file list** in the root `test` script
- `railway.toml` + `Procfile`, `/api/health` healthcheck
- Tailwind tokens + `.btn-*` / `.card` / `.field-*` classes; mobile shell: header + status bar + scroll main; `max-w-2xl` phone frame; JetBrains Mono + DM Sans; surface `#0f1419`, accent `#00d4aa`, signal `#ff6b35`
- Claude via `routes/claude.js` + `ANTHROPIC_API_KEY` / `CLAUDE_MODEL`
- `.env.example` with empty placeholders (do not copy FSC’s example-looking credentials)

**Do not copy:** Salesforce, PMI Excel engine, `data/jobs.json` file store, unused `multer` dead-dep (we *will* use multer for import uploads), domain screens.

**Deliberate deviation (document in `CLAUDE.md`):** FSC has no database. This app uses **Postgres**.

### 3.2 OSRS listing generator (`chefhousgit/osrs-listing-generator`)

License: “Personal use. No warranty.” Same-author ideas only — do not copy large blocks.

**Lift:** extract-then-write Claude JSON (`extractedData` then `listing`); user-confirmed facts beat model guesses; title-priority tokens; server-owned footer separate from AI; clipboard + editable preview; anti-hallucination (“report exact or omit”).

**Not present / do not assume:** pricing, CSV/XLSX export, marketplace adapters. We build those ourselves with `exceljs` and the `MarketplaceAdapter` interface.

### 3.3 ScreenShotta (`chefhousgit/ScreenShotta`)

Python tray app (`mss` + Pillow → temp PNG → Discord webhook). No license file. **Borrow the idea, not the code:** capture → temp PNG → upload → delete on success / keep on failure. Node agent uses a Node capture library later, behind `TradeExecutor.supportsScreenshots`. Day-one **manual executor does not require screenshots**.

---

## 4. PTCGPB recon (Agent A) — locked parser contract

**`<<PTCGPB_ROOT>>` is per-machine, never committed.**

| Machine | Value |
|---|---|
| Other PC (example) | `C:\Users\User\Desktop\PTCGPB-main` (folder that contains `PTCGPB.ahk`) |
| This PC | unset until PTCGPB is installed |
| Railway | **must not** be set — the server cannot see `C:\` |

Railway import path is **file upload** (account JSON / zip of `Accounts/Cards/`, never `Saved/`). Local-dev and the Windows agent may also scan `PTCGPB_ROOT` from env / `agent/config.json`.

### 4.1 Real files (6 account JSONs from the other PC)

Observed top-level shape (all six):

```json
{
  "deviceAccount": "<hex>",
  "metadata": {},
  "pulls": [{ "timestamp": "2026-08-22 13:05:43", "pack": "B4", "cards": ["PK_10_020130_00"] }],
  "registeredCards": [],
  "tradedCards": {},
  "sharedCards": {}
}
```

**Corrections vs the brief:**

| Brief claimed | Actual |
|---|---|
| Top-level `accountName`, `friendCode`, `instance`, `packCount`, `shinedust` | Nested under `metadata` |
| Top-level `displayName`, `collectionId` | Absent on these account files (collections JSON may have them) |
| `cardIds[]` | Only `cards[]` |
| Bare `shinedust` number | `{ "value": 360 }` |
| Always-present identity | 4/6 missing `accountName`/`friendCode`; 1/6 has empty `metadata` |
| Instance uniquely IDs an account | Two files both had `metadata.instance: "5"` |

**Inventory source of truth:** flatten `pulls[].cards[]`. Duplicate IDs = quantity. Do not require `registeredCards` or `dashboard.db`.

**Card IDs:** `PK_{type}_{id}_{variant}` / `TR_{type}_{id}_{variant}` / `PK_90_*` promos. Last segment `_00` / `_01` is variant.

**Marks:** `tradedCards` / `sharedCards` are `{ "PK_…": count }` or `{ "PK_…": { "count": N } }`. Import as pre-existing reservations so we do not oversell promised copies. Empty in this sample.

**`metadata.fileName`:** string like `<hex>.xml`. Parse as a label only. **Never open, walk, copy, or log `Accounts/Saved/**`.** Hard-exclude that path in any folder scan.

**Skip list:** a file with empty metadata and one pull is valid, not an error. Surface skips in the diff preview.

### 4.2 Public layout (confirmed, source not vendored)

| Path | Use |
|---|---|
| `Accounts/Cards/accounts/*.json` | Primary import |
| `Accounts/Cards/collections/*.json` | Same parser, collection mode (`registeredCards`, often no `pulls`) |
| `Accounts/Cards/wishlist.json` | Want-list: `{ cards: [{ id, name }] }` |
| `Accounts/Cards/database_cache/dashboard.db` | Optional fast path if `db_meta.schema_version === "3"`; else JSON fallback |
| `Helper/cardmap.json` or [leanny.github.io cardmap](https://leanny.github.io/pocket_tcg_resources/data/cardmap.json) | `PK_*` → `{ CollectionNumber, ExpansionID, IllustrationID }` |
| `Accounts/Saved/**/*.xml` | **NEVER** |

Do not call PTCGPB’s localhost dashboard HTTP API. Do not fork, vendor, or invoke `PTCGPB.ahk`.

### 4.3 Card catalog (committed seed, no runtime scrape)

- **Primary:** `flibustier/pokemon-tcg-pocket-database` (MIT) — `dist/cards.json`, `sets.json`, `rarities.json`
- **Bridge:** pin a copy of `cardmap.json` (PK_* → set + collection number)
- **Refresh:** `scripts/refresh-card-catalog.js` run manually
- TCGdex is MIT backup (`A1-001` IDs — extra mapping). Do not use the physical TCG API.

---

## 5. Architecture

```
[Phone / desktop browser]
        │  session cookie
        ▼
[Railway: Express + Postgres + built React SPA]
        │
        │  agent long-polls OUTBOUND only
        ▼
[Windows agent on any PC]
   - reads PTCGPB_ROOT locally (files at rest)
   - claims jobs, heartbeat, manual checklist
   - optional external TradeExecutor plugin (not in this repo)
```

**Multi-computer:** same Railway app. Each agent has its own `agent/config.json` (`AGENT_TOKEN`, `PTCGPB_ROOT`, `SERVER_URL`). Inventory is server-side; import can happen from any machine via upload or agent sync.

### 5.1 Database

- Production: Railway Postgres plugin, `DATABASE_URL`
- Query layer: `pg` + hand-written SQL in `scripts/migrate.js` (numbered files in `migrations/`). **No ORM, no Knex.**
- Local zero-step: if `DATABASE_URL` unset, boot **PGlite** (`@electric-sql/pglite`) in-process, run the same SQL migrations, seed demo data. Document this deviation in `CLAUDE.md`.
- `npm run dev` must work with no Docker and no manual `createdb`.

### 5.2 Interfaces (write first)

```
MarketplaceAdapter
  name, capabilities: { canPublish, canReceiveOrders, canCancel, isAutomated }
  publish(listing)           -> { externalId, url } | Error
  update(externalId, patch)  -> ok | Error
  cancel(externalId)         -> ok | Error
  fetchOrders(since)         -> Order[]
  markFulfilled(orderRef)    -> ok | Error
```

Ship: `MockAdapter`, `ManualExportAdapter` (listing text + clipboard + CSV/XLSX). Scaffold `EldoradoAdapter` behind `ELDORADO_ENABLED=false`. Do not invent Eldorado paths; leave stubs + `docs/eldorado-integration.md`.

```
TradeExecutor
  name, capabilities: { isAutomated, requiresLocalAgent, supportsScreenshots }
  validate(job)              -> Precheck { ok, reasons[] }
  execute(job, onProgress)   -> Result { status, evidence[], error? }
  cancel(jobId)              -> ok
```

Ship: `ManualExecutor` (checklist), `StubExecutor` (tests). Loader for an external plugin at `TRADE_EXECUTOR_PLUGIN` path — plugin is not in this repo.

**Credential boundary (both server dispatcher and agent receiver):**

A job payload carries identifiers only: `account_key`, instance name, friend ID. Reject any payload containing keys matching `/password|pass|pwd|username|user|token|secret|xml|credential/i` or a string matching `Accounts[\\/]Saved`. Unit tests on both ends with a poisoned payload.

### 5.3 Router and rules (pure, no I/O)

- `routes/utils/routing/` — score candidates: spare qty above reserved, free friend slot, trade currency, health `active`, emulator not locked, preference weight. Return **full ranked list + per-candidate reasons**.
- `routes/utils/rules/` — load `config/trade-rules.json` (versioned schema, placeholder values). Do not guess live game numbers. Document what to verify in `docs/trade-rules.md`.
- Listing composer refuses to publish a card no account can legally trade.

### 5.4 Oversell guards (three layers)

1. Schema: `inventory_reservations` + unique `(account_id, card_id, variant)`
2. Router: pre-flight before queue
3. UI: composer shows **sellable**, never raw total

Aggregates everywhere: **total held**, **sellable** (total − reserved − flagged/retired − rarity-ineligible), **per-account breakdown**.

---

## 6. Data model

Tables as in the brief: `accounts`, `cards`, `inventory_items`, `listings`, `inventory_reservations`, `orders`, `trade_jobs`, `friend_links`, `job_events`.

- `accounts.external_key` = `deviceAccount` (stable). Never join on display name.
- `listings` FK **card**, not inventory item. Router picks source account at fulfillment.
- Every trade-job state transition inserts a `job_events` row.
- Disappearing account on re-import → `health = retired`, never hard-delete.
- Job statuses: `queued → routed → claimed → friend_pending → in_progress → awaiting_confirmation → completed | failed | needs_human`.
- Stale heartbeat past TTL: revert to `queued`, release reservation and friend slot.
- Claim: `SELECT … FOR UPDATE SKIP LOCKED` keyed on source account (PGlite local may emulate with a transaction + `WHERE claimed_by IS NULL`). Document SKIP LOCKED as production-only if PGlite lacks it.

---

## 7. Local agent

- Standalone `agent/` Node worker, Windows-first
- Outbound long-poll only: `POST /api/agent/jobs/claim` with rotatable `AGENT_TOKEN` (local config, never in source)
- Claim → heartbeat (friend slots, currency, emulator reachable) → execute → report
- Concurrency **per account**, global cap
- Graceful shutdown releases claims
- `agent/README.md` + Task Scheduler / NSSM example
- Manual + stub executors + external plugin loader only

---

## 8. Web UI

Mirror FSC shell (header, status bar, hash views, phone-first). Extra desktop width for inventory table (`max-w-6xl` on Inventory / Jobs only).

Views:

1. **Inventory** — virtualized table grouped by card; expandable per-account rows; filters; bulk select → draft listings. Library: `@tanstack/react-virtual` (not a component kit).
2. **Listing composer** — `config/listing-templates.json` token substitution; per-adapter preview; price; Claude draft from card attributes; show **sellable**.
3. **Accounts** — slots, currency, health, instance, jobs in flight, last heartbeat.
4. **Orders + trade-job board** — kanban, event timeline, evidence, retry / force-fail / needs-human, routing override with ranked reasons. Warning banner (§3c).

ui-ux-pro-max (applied, FSC tokens win on color/type): 44px+ touch, 4.5:1 contrast, visible focus, `prefers-reduced-motion`, Lucide/Heroicons SVGs (no emoji icons), table + card fallback on mobile.

---

## 9. Env keys (names only)

**Server / Railway:** `PORT`, `NODE_ENV`, `APP_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `AGENT_TOKEN`, `MARKETPLACE_ADAPTER`, `TRADE_EXECUTOR`, `ELDORADO_ENABLED`

**Local-only (never required on Railway):** `PTCGPB_ROOT`

**Agent `config.json` (gitignored):** `serverUrl`, `agentToken`, `ptcgpbRoot`, `executor`, `heartbeatSeconds`, `claimTtlSeconds`

---

## 10. Out of scope (do not build)

- Fork / vendor / invoke PTCGPB
- Eldorado request schemas
- Inbound port on the desktop
- Emulator automation (build the socket only)
- PTCGPB dashboard clone or its localhost endpoints
- TypeScript, heavy ORM, non-Railway deploy
- Reading `Accounts/Saved/`
- Committing secrets, friend codes, or the user’s real account JSON

---

## 11. Acceptance (from brief)

1. `npm install && npm run dev` boots with seed data, zero manual DB steps
2. Import real multi-account inventory, every row attributed, diff preview before commit
3. Select 20 cards → 20 drafts → `ManualExportAdapter` CSV
4. Manual sale → order + reserved copy on a specific account + routed job
5. Agent claims, manual checklist, full event timeline
6. Multi-account proofs (a–d) as specified
7. Swap executor to stub via config — UI unchanged
8. Poisoned job payload rejected on server and agent; tests pass
9. Railway + phone browser + same session-auth as FSC

---

## 12. Open items for you (defaults if you say nothing)

1. **Local DB:** PGlite when `DATABASE_URL` unset — OK?
2. **Hash routing like FSC** (no react-router) — OK?
3. **FSC teal/orange tokens** (not the ui-ux-pro-max cinema-green palette) — OK?
4. **Do not commit** your six real account files; seed is synthetic — OK?
5. Railway deploy in this first pass vs local-only until you are back — default: **scaffold Railway files, do not deploy** without you.
