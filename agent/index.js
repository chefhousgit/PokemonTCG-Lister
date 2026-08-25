const fs = require('fs');
const path = require('path');
const { assertSafeJobPayload } = require('./jobPayload');
const { discoverDashboard, applyWrites, pullLive } = require('./ptcgpbDashboard');

function loadConfig() {
  const file = path.join(__dirname, 'config.json');
  if (!fs.existsSync(file)) {
    console.error('Missing agent/config.json — copy agent/config.example.json');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function call(config, pathname, body) {
  const res = await fetch(`${config.serverUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.agentToken}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function applyPendingWrites(config, writes) {
  if (!writes || !writes.length) return;
  const base = await discoverDashboard(config);
  if (!base) {
    console.error('[agent] dashboard writes pending but card dashboard is not reachable');
    return;
  }
  await applyWrites(base, writes);
  console.log(`[agent] applied ${writes.length} dashboard write(s) to ${base}`);
}

async function pushLive(config) {
  const base = await discoverDashboard(config);
  if (!base) {
    await call(config, '/api/agent/dashboard/status', {
      agentId: config.agentId,
      online: false,
      error: 'PTCGPB card dashboard is not reachable on this PC. Keep start_card_dashboard running.',
    });
    return false;
  }
  const live = await pullLive(base);
  await call(config, '/api/agent/dashboard/live', {
    agentId: config.agentId,
    dashboardUrl: live.dashboardUrl,
    summary: live.summary,
    rows: live.rows,
    marks: live.marks,
    wishlist: live.wishlist,
    uiPrefs: live.uiPrefs,
  });
  const accounts = live.summary && live.summary.accountCount;
  console.log(`[agent] live dashboard ${base} · ${accounts || 0} accounts`);
  return true;
}

async function syncDashboard(config) {
  const pending = await call(config, '/api/agent/dashboard/pull-writes', { agentId: config.agentId });
  await applyPendingWrites(config, pending.writes);
  await pushLive(config);
}

async function loop(config) {
  const claimed = await call(config, '/api/agent/jobs/claim', { agentId: config.agentId });
  if (!claimed.job) return;
  assertSafeJobPayload(claimed.payload);
  console.log(`[agent] claimed job ${claimed.job.id}`);

  await call(config, `/api/agent/jobs/${claimed.job.id}/heartbeat`, {
    emulator_reachable: true,
  });

  const steps = claimed.checklist || [];
  for (const [i, step] of steps.entries()) {
    await call(config, `/api/agent/jobs/${claimed.job.id}/event`, {
      type: 'checklist_step',
      status: i === 0 ? 'in_progress' : undefined,
      payload: { step: i + 1, message: step, account_key: claimed.payload.account_key },
    });
    console.log(`[agent] ${i + 1}/${steps.length} ${step}`);
  }

  await call(config, `/api/agent/jobs/${claimed.job.id}/event`, {
    type: 'awaiting_operator',
    status: 'awaiting_confirmation',
    payload: { account_key: claimed.payload.account_key },
  });
  console.log(`[agent] job ${claimed.job.id} waiting for you to complete the in-game trade, then mark complete in the UI`);
}

async function main() {
  const config = loadConfig();
  const checkMs = Number(config.checkMs) > 0 ? Number(config.checkMs) : 5000;
  const pollMs = Number(config.pollMs) > 0 ? Number(config.pollMs) : 60000;
  console.log(`[agent] polling ${config.serverUrl} as ${config.agentId}`);
  console.log(`[agent] live pull every ${pollMs}ms · pull-now check every ${checkMs}ms`);
  if (config.ptcgpbRoot) {
    console.log(`[agent] local PTCGPB root (files at rest + live dashboard ping only): ${config.ptcgpbRoot}`);
  }

  let lastSync = 0;
  let ticking = false;

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      let pending = { writes: [], pullRequested: false };
      try {
        pending = await call(config, '/api/agent/dashboard/pull-writes', { agentId: config.agentId });
        await applyPendingWrites(config, pending.writes);
      } catch (err) {
        console.error('[agent] dashboard writes', err.message);
      }

      const due = pending.pullRequested || Date.now() - lastSync >= pollMs;
      if (due) {
        try {
          await pushLive(config);
        } catch (err) {
          console.error('[agent] dashboard', err.message);
        } finally {
          lastSync = Date.now();
        }
      }
    } finally {
      try {
        await loop(config);
      } catch (err) {
        console.error('[agent]', err.message);
      }
      ticking = false;
    }
  };

  await tick();
  setInterval(tick, checkMs);
}

if (require.main === module) {
  main();
}

module.exports = { loop, loadConfig, syncDashboard, pushLive };
