const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HOUR_MS,
  countWatchedFromRows,
  addedSince,
  normalizeWatchList,
  sanitizeWebhook,
  mergeAlertSettings,
  evaluateHourlyAlert,
  buildDiscordPayload,
  buildTestDiscordPayload,
  snapshotReport,
} = require('./cardAlerts');

const rows = [
  { account: 'a', cardIds: ['PK_1', 'PK_1', 'PK_2'] },
  { account: 'b', cardIds: ['PK_1'] },
].map((row) => JSON.stringify(row)).join('\n');

test('countWatchedFromRows totals only watched card ids', () => {
  const counts = countWatchedFromRows(rows, ['PK_1', 'PK_9']);
  assert.deepEqual(counts, { PK_1: 3, PK_9: 0 });
});

test('addedSince reports only increases', () => {
  const added = addedSince({ PK_1: 1, PK_2: 4 }, { PK_1: 4, PK_2: 4, PK_3: 2 }, ['PK_1', 'PK_2', 'PK_3']);
  assert.deepEqual(added, [
    { cardId: 'PK_1', added: 3, total: 4 },
    { cardId: 'PK_3', added: 2, total: 2 },
  ]);
});

test('normalizeWatchList keeps unique PK/TR ids', () => {
  assert.deepEqual(
    normalizeWatchList(['PK_1', 'pk_1', 'TR_2', 'nope', 'PK_1']),
    ['PK_1', 'TR_2'],
  );
});

test('sanitizeWebhook accepts Discord webhook urls only', () => {
  const url = 'https://discord.com/api/webhooks/123/abc-TOKEN';
  assert.equal(sanitizeWebhook(url), url);
  assert.throws(() => sanitizeWebhook('https://example.com/hook'), /Discord webhook/);
});

test('sanitizeWebhook accepts wrapped, canary, and query-string Discord urls', () => {
  assert.equal(
    sanitizeWebhook('<https://discord.com/api/webhooks/123/abcTOKEN>'),
    'https://discord.com/api/webhooks/123/abcTOKEN',
  );
  assert.equal(
    sanitizeWebhook('https://canary.discord.com/api/webhooks/123/abc.TOKEN/?wait=true'),
    'https://canary.discord.com/api/webhooks/123/abc.TOKEN',
  );
  assert.equal(
    sanitizeWebhook('https://ptb.discord.com/api/v10/webhooks/123/abc_TOKEN/'),
    'https://ptb.discord.com/api/webhooks/123/abc_TOKEN',
  );
});

test('mergeAlertSettings can update watches without touching the webhook', () => {
  const merged = mergeAlertSettings(
    { webhookUrl: 'https://discord.com/api/webhooks/123/abc-TOKEN', cardIds: ['PK_1'], lastCounts: { PK_1: 2 }, lastSentAt: 9, baselineReady: true },
    { cardIds: ['PK_1', 'PK_2'] },
  );
  assert.equal(merged.webhookUrl, 'https://discord.com/api/webhooks/123/abc-TOKEN');
  assert.deepEqual(merged.cardIds, ['PK_1', 'PK_2']);
  assert.equal(merged.baselineReady, true);
  assert.deepEqual(merged.lastCounts, { PK_1: 2 });
});

test('evaluateHourlyAlert baselines the first snapshot', () => {
  const now = 1_000_000;
  const result = evaluateHourlyAlert({
    webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    cardIds: ['PK_1'],
    lastCounts: {},
    lastSentAt: 0,
    baselineReady: false,
  }, { PK_1: 5 }, now);
  assert.equal(result.send, false);
  assert.equal(result.state.baselineReady, true);
  assert.deepEqual(result.state.lastCounts, { PK_1: 5 });
});

test('evaluateHourlyAlert waits until an hour has passed', () => {
  const now = 1_000_000;
  const result = evaluateHourlyAlert({
    webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    cardIds: ['PK_1'],
    lastCounts: { PK_1: 1 },
    lastSentAt: now - 10 * 60 * 1000,
    baselineReady: true,
  }, { PK_1: 4 }, now);
  assert.equal(result.send, false);
  assert.equal(result.added.length, 0);
});

test('evaluateHourlyAlert sends x3 after an hour when copies were added', () => {
  const now = 1_000_000;
  const result = evaluateHourlyAlert({
    webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    cardIds: ['PK_1'],
    lastCounts: { PK_1: 1 },
    lastSentAt: now - HOUR_MS,
    baselineReady: true,
  }, { PK_1: 4 }, now);
  assert.equal(result.send, true);
  assert.deepEqual(result.added, [{ cardId: 'PK_1', added: 3, total: 4 }]);
  assert.equal(result.state.lastSentAt, now);
  assert.deepEqual(result.state.lastCounts, { PK_1: 4 });
});

test('evaluateHourlyAlert does not send when nothing new after an hour', () => {
  const now = 1_000_000;
  const result = evaluateHourlyAlert({
    webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    cardIds: ['PK_1'],
    lastCounts: { PK_1: 4 },
    lastSentAt: now - HOUR_MS,
    baselineReady: true,
  }, { PK_1: 4 }, now);
  assert.equal(result.send, false);
  assert.equal(result.state.lastSentAt, now);
});

test('evaluateHourlyAlert baselines newly watched cards so existing copies do not fire', () => {
  const now = 1_000_000;
  const result = evaluateHourlyAlert({
    webhookUrl: 'https://discord.com/api/webhooks/123/abc',
    cardIds: ['PK_1', 'PK_2'],
    lastCounts: { PK_1: 2 },
    lastSentAt: now - HOUR_MS,
    baselineReady: true,
  }, { PK_1: 2, PK_2: 7 }, now);
  assert.equal(result.send, false);
  assert.equal(result.state.lastCounts.PK_2, 7);
});

test('buildDiscordPayload uses total and xN since last webhook', () => {
  const payload = buildDiscordPayload(
    [{ cardId: 'PK_1', added: 3, total: 100 }],
    () => ({ name: 'Pikachu', image_url: 'https://img.example/pika.png' }),
  );
  assert.equal(payload.embeds[0].title, 'Pikachu');
  assert.equal(payload.embeds[0].description, '100 total, x3 since last webhook');
  assert.equal(payload.embeds[0].thumbnail.url, 'https://img.example/pika.png');
});

test('snapshotReport includes unchanged watched cards for a force send', () => {
  const rows = snapshotReport({ PK_1: 97, PK_2: 4 }, { PK_1: 100, PK_2: 4 }, ['PK_1', 'PK_2']);
  assert.deepEqual(rows, [
    { cardId: 'PK_1', added: 3, total: 100 },
    { cardId: 'PK_2', added: 0, total: 4 },
  ]);
});

test('buildTestDiscordPayload uses live totals vs last webhook', () => {
  const payload = buildTestDiscordPayload(
    { cardIds: ['PK_1'], lastCounts: { PK_1: 97 } },
    { PK_1: 100 },
    () => ({ name: 'Pikachu', image_url: 'https://img.example/pika.png' }),
  );
  assert.equal(payload.embeds[0].description, '100 total, x3 since last webhook');
});
