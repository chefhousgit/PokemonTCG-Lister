const { assertSafeJobPayload } = require('./jobPayload');
const { getTradeExecutor } = require('./executors/pluginLoader');

async function addJobEvent(db, jobId, actor, type, payload) {
  await db.query(
    `INSERT INTO job_events (job_id, actor, type, payload_json)
     VALUES ($1, $2, $3, $4)`,
    [jobId, actor, type, payload ? JSON.stringify(payload) : null],
  );
}

function jobPayloadFromRow(job, account, card) {
  const payload = {
    job_id: job.id,
    account_key: account && account.external_key,
    instance: account && account.emulator_instance,
    buyer_friend_id: job.target_friend_id,
    card_id: card && card.card_id,
  };
  assertSafeJobPayload(payload);
  return payload;
}

function executor() {
  return getTradeExecutor();
}

module.exports = { addJobEvent, jobPayloadFromRow, executor };
