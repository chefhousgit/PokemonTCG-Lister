function asCountMap(marks) {
  const out = {};
  if (!marks || typeof marks !== 'object') return out;
  for (const [cardId, raw] of Object.entries(marks)) {
    if (typeof raw === 'number') out[cardId] = raw;
    else if (raw && typeof raw === 'object' && typeof raw.count === 'number') out[cardId] = raw.count;
    else out[cardId] = 1;
  }
  return out;
}

function countCards(ids) {
  const counts = {};
  for (const id of ids || []) {
    if (!id || typeof id !== 'string') continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

function flattenPulls(pulls) {
  const ids = [];
  const skipped = [];
  for (const pull of pulls || []) {
    if (!pull || typeof pull !== 'object') {
      skipped.push({ reason: 'invalid_pull', pull });
      continue;
    }
    const cards = pull.cards || pull.Cards || pull.cardIds;
    if (typeof cards === 'string') {
      ids.push(...cards.split(/[|;,\s]+/).filter(Boolean));
      continue;
    }
    if (Array.isArray(cards)) {
      ids.push(...cards.filter((c) => typeof c === 'string'));
      continue;
    }
    skipped.push({ reason: 'pull_missing_cards', timestamp: pull.timestamp });
  }
  return { ids, skipped };
}

function parseAccountJson(obj, filename) {
  const skipped = [];
  if (!obj || typeof obj !== 'object') {
    return { skipped: [{ reason: 'not_an_object', filename }] };
  }

  const stem = filename ? String(filename).replace(/\.[^.]+$/, '') : '';
  const deviceAccount = obj.deviceAccount || stem;
  if (!deviceAccount) {
    skipped.push({ reason: 'missing_deviceAccount', filename });
    return { skipped };
  }

  const metadata = obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {};
  const { ids, skipped: pullSkips } = flattenPulls(obj.pulls);
  skipped.push(...pullSkips);

  let counts = countCards(ids);
  if (Object.keys(counts).length === 0 && Array.isArray(obj.registeredCards) && obj.registeredCards.length) {
    counts = countCards(obj.registeredCards);
  }

  return {
    account: {
      external_key: String(deviceAccount),
      label: metadata.accountName || obj.displayName || deviceAccount,
      in_game_handle: metadata.accountName || obj.displayName || null,
      friend_id: metadata.friendCode || null,
      emulator_instance: metadata.instance != null ? String(metadata.instance) : null,
      packs_opened: Number(metadata.packCount) || 0,
      trade_currency: Number(metadata.shinedust && metadata.shinedust.value) || 0,
      notes: metadata.fileName ? `xml-label:${metadata.fileName}` : null,
    },
    counts,
    marks: {
      traded: asCountMap(obj.tradedCards),
      shared: asCountMap(obj.sharedCards),
    },
    skipped,
  };
}

module.exports = { parseAccountJson, countCards, flattenPulls };
