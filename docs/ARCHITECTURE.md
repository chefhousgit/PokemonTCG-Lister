# Architecture

```
Browser (phone or desktop)
  → Railway Express + Postgres + built SPA
       ← Windows agent long-polls /api/agent (outbound only)
            reads PTCGPB files at rest on that PC
```

## Multi-computer paths

`ptcgpb_paths` stores `{ label, folder_path }`. Settings UI writes it. Import can scan a path if the **server process** can see the folder (local `npm run dev`). On Railway, scan returns `path_not_visible` and the user uploads account JSON instead, or the agent on that PC uses its local folder.

## State

Listings point at **cards**, not inventory rows. The router picks a source account at sale time. Reservations + `reserved_qty` prevent oversell. Every job transition writes `job_events`.

## Auth

Same as FSC: `APP_PASSWORD` + `express-session`. Agent routes skip the session and use `AGENT_TOKEN`.
