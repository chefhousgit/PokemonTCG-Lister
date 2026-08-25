function expandCounts(counts) {
  const ids = [];
  for (const [id, qty] of Object.entries(counts || {})) {
    const n = Number(qty || 0);
    for (let i = 0; i < n; i += 1) ids.push(id);
  }
  return ids;
}

function asDocument(account, inventoryCounts = {}) {
  if (account.source_json && typeof account.source_json === 'object') {
    return account.source_json;
  }
  const cards = expandCounts(inventoryCounts);
  return {
    deviceAccount: account.external_key,
    metadata: {
      accountName: account.in_game_handle || account.label,
      friendCode: account.friend_id || '',
      instance: account.emulator_instance || '',
      packCount: Number(account.packs_opened || 0),
      shinedust: { value: Number(account.trade_currency || 0) },
      fileName: account.notes && String(account.notes).startsWith('xml-label:')
        ? String(account.notes).slice('xml-label:'.length)
        : '',
    },
    pulls: cards.length ? [{
      pack: 'Imported',
      timestamp: account.updated_at || account.created_at || '',
      cards,
    }] : [],
    registeredCards: Object.keys(inventoryCounts || {}),
  };
}

function compactRowsFromDocument(doc) {
  const account = String(doc.deviceAccount || doc.account || '').trim();
  const rows = [];
  const pulls = Array.isArray(doc.pulls) ? doc.pulls : [];
  for (const pull of pulls) {
    if (!pull || typeof pull !== 'object') continue;
    const packValue = pull.pack || pull.Pack || pull.packCode || '';
    const pack = Array.isArray(packValue)
      ? packValue.map((v) => String(v || '').trim()).filter(Boolean).join(', ')
      : String(packValue || '').trim() || '(blank pack)';
    const cardsValue = pull.cards || pull.Cards || pull.cardIds || [];
    const cardIds = Array.isArray(cardsValue)
      ? cardsValue.map((v) => String(v || '').trim()).filter(Boolean)
      : String(cardsValue || '').split(/[|;,\s]+/).filter(Boolean);
    if (!cardIds.length) continue;
    rows.push({
      account,
      pack,
      sourcePack: pack,
      timestamp: String(pull.timestamp || pull.Timestamp || pull.time || ''),
      cardIds,
    });
  }
  return rows;
}

function summaryEntry(account, doc, inventoryCounts = {}) {
  const metadata = (doc && doc.metadata && typeof doc.metadata === 'object') ? doc.metadata : {};
  const registered = Array.isArray(doc.registeredCards) ? doc.registeredCards : Object.keys(inventoryCounts);
  const pulls = compactRowsFromDocument(doc);
  const isCollection = (!pulls.length && registered.length) || metadata.registryImportedAt;
  const shinedust = metadata.shinedust && typeof metadata.shinedust === 'object'
    ? Number(metadata.shinedust.value || 0)
    : Number(account.trade_currency || 0);
  return {
    account: account.external_key,
    sourceType: isCollection ? 'collection' : 'trade',
    sourceFileName: metadata.fileName || '',
    fileLabel: metadata.fileName || '',
    displayName: metadata.accountName || account.label,
    accountName: metadata.accountName || account.in_game_handle || account.label,
    friendCode: metadata.friendCode || account.friend_id || '',
    instance: metadata.instance != null ? String(metadata.instance) : (account.emulator_instance || ''),
    deviceAccount: account.external_key,
    collectionId: isCollection ? account.external_key : '',
    metadata: {
      createdAt: metadata.createdAt || account.created_at || '',
      lastLoggedIn: metadata.lastLoggedIn || '',
      lastPackPulled: metadata.lastPackPulled || '',
      lastModified: metadata.lastModified || account.updated_at || '',
      packCount: Number(metadata.packCount || account.packs_opened || 0),
      accountName: metadata.accountName || account.in_game_handle || account.label,
      friendCode: metadata.friendCode || account.friend_id || '',
      instance: metadata.instance != null ? String(metadata.instance) : (account.emulator_instance || ''),
      registryImportedAt: metadata.registryImportedAt || '',
    },
    shinedust,
    pullCount: pulls.length,
    cardCount: pulls.reduce((n, row) => n + row.cardIds.length, 0) || Object.values(inventoryCounts).reduce((n, q) => n + Number(q || 0), 0),
    uniqueCardCount: new Set(pulls.flatMap((row) => row.cardIds).concat(registered)).size,
    registryCardCount: registered.length,
    registeredCards: registered,
    tradedCards: doc.tradedCards || {},
    sharedCards: doc.sharedCards || {},
  };
}

function buildDashboardPayload(accounts, countsByAccountId = {}) {
  const documents = [];
  const summaryAccounts = [];
  const rows = [];
  let totalCards = 0;
  const unique = new Set();

  for (const account of accounts) {
    if (account.health === 'retired') continue;
    const counts = countsByAccountId[account.id] || {};
    const doc = asDocument(account, counts);
    documents.push(doc);
    const entry = summaryEntry(account, doc, counts);
    summaryAccounts.push(entry);
    const compact = compactRowsFromDocument(doc);
    for (const row of compact) {
      rows.push(row);
      totalCards += row.cardIds.length;
      for (const id of row.cardIds) unique.add(id);
    }
  }

  const tradeAccountCount = summaryAccounts.filter((a) => a.sourceType !== 'collection').length;
  const collectionRegistryCount = summaryAccounts.filter((a) => a.sourceType === 'collection').length;

  return {
    documents,
    rows,
    summary: {
      ok: true,
      source: 'lister',
      accountCount: summaryAccounts.length,
      tradeAccountCount,
      collectionRegistryCount,
      rowCount: rows.length,
      totalCards,
      uniqueCardCount: unique.size,
      skippedCount: 0,
      skipped: [],
      accounts: summaryAccounts,
    },
  };
}

module.exports = {
  expandCounts,
  asDocument,
  compactRowsFromDocument,
  summaryEntry,
  buildDashboardPayload,
};
