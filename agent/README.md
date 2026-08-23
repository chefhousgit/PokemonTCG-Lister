# Local Windows agent

Outbound-only worker. It long-polls the Railway (or local) server. Nothing listens on your desktop.

## Setup

1. Copy `config.example.json` to `config.json`.
2. Set `serverUrl` to your app (e.g. `https://your-app.up.railway.app` or `http://localhost:3001`).
3. Set `agentToken` to the same `AGENT_TOKEN` as the server.
4. Optional: set `ptcgpbRoot` to this computer's PTCGPB folder. You can also save paths in the web app **Settings** tab.

```
node agent/index.js
```

## Task Scheduler

Create a Basic Task → Start a program → `node` with arguments `C:\path\to\PokemonTCG-Lister\agent\index.js`, start in the repo folder, run whether user is logged on or not.

## NSSM

```
nssm install PokemonTcgAgent d:\path\to\node.exe
nssm set PokemonTcgAgent AppParameters agent\index.js
nssm set PokemonTcgAgent AppDirectory C:\path\to\PokemonTCG-Lister
nssm start PokemonTcgAgent
```

The agent ships **manual** and **stub** executors only. It never launches PTCGPB and never reads `Accounts\Saved`.
