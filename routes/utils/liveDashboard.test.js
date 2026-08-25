const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePortsFile, setLive, getLive, getLiveMeta, queueWrite, takePendingWrites, requestPull, takePullRequest } = require('./liveDashboard');

test('parsePortsFile reads primary and legacy', () => {
  const ports = parsePortsFile('primary=51234\nlegacy=51235\nsplash=51236\n');
  assert.equal(ports.primary, 51234);
  assert.equal(ports.legacy, 51235);
});

test('fresh live snapshot is preferred', () => {
  setLive({
    agentId: 'desktop-1',
    dashboardUrl: 'http://127.0.0.1:51234',
    summary: { ok: true, accountCount: 3, accounts: [] },
    rows: '{"account":"a","pack":"Pikachu","cardIds":["PK_1"]}\n',
  });
  const live = getLive();
  assert.equal(live.summary.accountCount, 3);
  assert.equal(getLiveMeta().source, 'ptcgpb');
  assert.equal(getLiveMeta().live, true);
});

test('wishlist write is queued for the agent', () => {
  queueWrite('wishlist', { cards: [{ id: 'PK_1', name: 'Bulbasaur' }] });
  const pending = takePendingWrites();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].kind, 'wishlist');
  assert.equal(takePendingWrites().length, 0);
});

test('requestPull is consumed once by the agent', () => {
  assert.equal(takePullRequest(), false);
  requestPull();
  assert.equal(getLiveMeta().pullRequested, true);
  assert.equal(takePullRequest(), true);
  assert.equal(takePullRequest(), false);
  assert.equal(getLiveMeta().pullRequested, false);
});
