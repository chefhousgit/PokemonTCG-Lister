# PokemonTCG-Lister

Multi-account Pokémon TCG Pocket inventory, listings, and trade-job dispatch. Mirrors the Field Service Companion Express + Vite + Railway shape. Day one works with mock/manual marketplace export and a manual trade checklist — no PTCGPB process, no Eldorado API, no emulator bot.

## Risks

Botting and selling accounts or in-game items can violate Pokémon TCG Pocket terms of service and can get accounts banned. This app tracks inventory and listings. It does not drive the game. A warning also appears on the trade-job board.

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:3001** (not the Vite 5173 port). Seed data loads automatically. No Docker, no `createdb`.

## PTCGPB path — any computer

Do not hardcode a drive path in the repo.

1. Open **Settings** in the app.
2. Give the computer a label (e.g. `Desktop PC`).
3. Paste the PTCGPB folder for **that** machine, e.g. `C:\Users\User\Desktop\PTCGPB-main`.
4. Save. Add another row when you use a different PC.
5. On **Import**, scan a saved folder (only works if this server can see the disk) **or** upload `Accounts\Cards\accounts\*.json` from any browser.

Never import `Accounts\Saved` — those XML files are passwords.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API + Vite |
| `npm test` | `node --test` (explicit file list) |
| `npm start` | production server |
| `npm run build` | build client for Railway |

## Stack

Express (CommonJS) + `express-session`, React/Vite/Tailwind (JSX), Postgres on Railway, PGlite locally, `node --test`.
