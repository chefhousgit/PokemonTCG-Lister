const fs = require('fs');
const path = require('path');
const { assertSafeJobPayload } = require('./jobPayload');

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
  console.log(`[agent] polling ${config.serverUrl} as ${config.agentId}`);
  if (config.ptcgpbRoot) {
    console.log(`[agent] local PTCGPB root (files at rest only): ${config.ptcgpbRoot}`);
  }
  const tick = async () => {
    try {
      await loop(config);
    } catch (err) {
      console.error('[agent]', err.message);
    }
  };
  await tick();
  setInterval(tick, config.pollMs || 5000);
}

if (require.main === module) {
  main();
}

module.exports = { loop, loadConfig };
