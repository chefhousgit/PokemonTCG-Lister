const fs = require('fs');
const path = require('path');
const axios = require('axios');

const IMAGE_PREFIX = 'https://leanny.github.io/pocket_tcg_resources/img/M/US/';
const RARITY_ICON_PREFIX = 'https://leanny.github.io/pocket_tcg_resources/img/rarity/';
const SET_LOGO_PREFIX = 'https://leanny.github.io/pocket_tcg_resources/img/logos/';

const RARITY_MAP = {
  100: { label: '♦', code: 'C', icon: 'C.png', group: 'diamond' },
  200: { label: '♦♦', code: 'U', icon: 'C.png', group: 'diamond' },
  300: { label: '♦♦♦', code: 'R', icon: 'C.png', group: 'diamond' },
  400: { label: '♦♦♦♦', code: 'RR', icon: 'C.png', group: 'diamond' },
  500: { label: '★', code: 'AR', icon: 'AR.png', group: 'star' },
  600: { label: '★★', code: 'SR', icon: 'SR.png', group: 'star' },
  700: { label: '★★', code: 'SR', icon: 'SR.png', group: 'star' },
  800: { label: '★★★ Immersive', code: 'IM', icon: 'IM.png', group: 'immersive' },
  830: { label: '★ Shiny', code: 'S', icon: 'S.png', group: 'shiny' },
  860: { label: '★★ Shiny', code: 'SSR', icon: 'SSR.png', group: 'shiny' },
  900: { label: '👑 Crown', code: 'UR', icon: 'UR.png', group: 'crown' },
};

const SOURCES = {
  cardmap: 'https://leanny.github.io/pocket_tcg_resources/data/cardmap.json',
  cardmaster: 'https://leanny.github.io/pocket_tcg_resources/data/cardmaster.json',
  localisation: 'https://leanny.github.io/pocket_tcg_resources/data/en_US.json',
};

const CATALOG_DIR = path.join(__dirname, '../../data/card-catalog');

let cache = null;
let loadPromise = null;

function rarityMeta(value) {
  const n = Number(value);
  return RARITY_MAP[n] || { label: 'Unknown', code: 'UNK', icon: '', group: 'other' };
}

function imageUrl(illustrationId) {
  if (!illustrationId) return '';
  return `${IMAGE_PREFIX}${encodeURIComponent(illustrationId)}.png`;
}

function rarityIconUrl(rarityValue) {
  const meta = rarityMeta(rarityValue);
  return meta.icon ? `${RARITY_ICON_PREFIX}${meta.icon}` : '';
}

function setLogoUrl(setCode) {
  if (!setCode) return '';
  return `${SET_LOGO_PREFIX}LOGO_expansion_${setCode}_en_US.png`;
}

function readJsonIfPresent(file) {
  const full = path.join(CATALOG_DIR, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  fs.writeFileSync(path.join(CATALOG_DIR, file), JSON.stringify(data));
}

async function downloadJson(url, file) {
  const res = await axios.get(url, { timeout: 60000 });
  writeJson(file, res.data);
  return res.data;
}

function localisedName(localisation, key, fallback) {
  if (!key) return fallback;
  const loc = localisation || {};
  const direct = String(loc[key] ?? '').trim();
  if (direct) return direct;
  return fallback;
}

function mapEntry(entry) {
  if (!entry || typeof entry !== 'object') return {};
  return {
    expansionId: entry.ExpansionID || entry.ExpansionId || entry.expansionId || entry.Expansion || '',
    collectionNumber: entry.CollectionNumber || entry.collectionNumber || entry.Number || entry.CardNo || '',
    illustrationId: entry.IllustrationID || entry.IllustrationId || '',
  };
}

function buildIndex(cardmaster, cardmap, localisation) {
  const cards = {};
  const expansions = new Map();
  const ids = new Set([
    ...Object.keys(cardmaster || {}),
    ...Object.keys(cardmap || {}),
  ]);

  for (const cardId of ids) {
    if (!/^(PK|TR)_/.test(cardId)) continue;
    const master = (cardmaster && cardmaster[cardId]) || {};
    const mapped = mapEntry(cardmap && cardmap[cardId]);
    const rarityValue = master.Rarity != null ? Number(master.Rarity) : null;
    const rarity = rarityMeta(rarityValue);
    const illustrationId = master.IllustrationID || mapped.illustrationId || '';
    const setCode = String(mapped.expansionId || master.ExpansionID || '').trim();
    const number = mapped.collectionNumber != null && mapped.collectionNumber !== ''
      ? String(mapped.collectionNumber)
      : '';
    const name = localisedName(localisation, master.Name, master.Name || cardId);
    cards[cardId] = {
      card_id: cardId,
      name,
      set_code: setCode,
      number,
      rarity: rarity.code,
      rarity_label: rarity.label,
      rarity_value: rarityValue,
      rarity_group: rarity.group,
      illustration_id: illustrationId,
      image_url: imageUrl(illustrationId),
      rarity_icon: rarityIconUrl(rarityValue),
      trainer: cardId.startsWith('TR_') || rarityValue === 700,
    };
    if (setCode && !expansions.has(setCode)) {
      expansions.set(setCode, {
        code: setCode,
        label: localisedExpansion(localisation, setCode),
        logo: setLogoUrl(setCode),
      });
    }
  }

  return {
    cards,
    expansions: [...expansions.values()].sort((a, b) => a.code.localeCompare(b.code)),
    rarities: Object.entries(RARITY_MAP).map(([value, meta]) => ({
      value: Number(value),
      ...meta,
      icon: meta.icon ? `${RARITY_ICON_PREFIX}${meta.icon}` : '',
    })),
  };
}

function localisedExpansion(localisation, setCode) {
  const loc = localisation || {};
  for (const [key, value] of Object.entries(loc)) {
    const match = key.match(/^EXPANSION_NAME_(\d+)$/);
    if (match && String(value || '').trim() === setCode) {
      const longName = String(loc[`EXPANSION_NAME_LONG_${match[1]}`] || '').trim();
      return longName ? `${setCode} · ${longName}` : setCode;
    }
  }
  return setCode;
}

function indexFromDisk() {
  const cardmaster = readJsonIfPresent('cardmaster.json');
  const cardmap = readJsonIfPresent('cardmap.json');
  const localisation = readJsonIfPresent('en_US.json');
  if (!cardmaster && !cardmap) return null;
  return buildIndex(cardmaster || {}, cardmap || {}, localisation || {});
}

async function ensureCatalog(options = {}) {
  if (cache && !options.force) return cache;
  if (loadPromise && !options.force) return loadPromise;
  loadPromise = (async () => {
    let indexed = (!options.force && !options.skipDownload) ? indexFromDisk() : null;
    if ((!indexed || options.force) && !options.skipDownload) {
      try {
        const [cardmap, cardmaster, localisation] = await Promise.all([
          downloadJson(SOURCES.cardmap, 'cardmap.json'),
          downloadJson(SOURCES.cardmaster, 'cardmaster.json'),
          downloadJson(SOURCES.localisation, 'en_US.json'),
        ]);
        indexed = buildIndex(cardmaster, cardmap, localisation);
      } catch (err) {
        indexed = indexFromDisk();
        if (!indexed) {
          console.warn('[catalog] download failed:', err.message);
          indexed = { cards: {}, expansions: [], rarities: [] };
        }
      }
    }
    cache = indexed || { cards: {}, expansions: [], rarities: [] };
    return cache;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function getCatalog() {
  return cache || { cards: {}, expansions: [], rarities: [] };
}

function lookupCard(cardId) {
  if (!cache || !cardId) return null;
  return cache.cards[cardId] || null;
}

function listCatalogCards() {
  if (!cache) return [];
  return Object.values(cache.cards);
}

function enrichCardRow(card) {
  const info = lookupCard(card.card_id);
  if (!info) {
    return {
      ...card,
      image_url: card.image_ref || '',
      rarity_label: card.rarity,
      rarity_icon: '',
    };
  }
  const nameIsKey = !card.name || card.name === card.card_id;
  return {
    ...card,
    name: nameIsKey ? info.name : card.name,
    set_code: card.set_code || info.set_code,
    number: card.number || info.number,
    rarity: card.rarity === 'unknown' ? info.rarity : card.rarity,
    image_ref: card.image_ref || info.image_url,
    image_url: info.image_url || card.image_ref || '',
    rarity_label: info.rarity_label,
    rarity_value: info.rarity_value,
    rarity_group: info.rarity_group,
    rarity_icon: info.rarity_icon,
    trainer: info.trainer,
  };
}

function catalogFields(cardId) {
  const info = lookupCard(cardId);
  if (!info) return { name: cardId, rarity: 'unknown', variant: String(cardId).split('_').pop() || '00' };
  return {
    name: info.name,
    rarity: info.rarity,
    set_code: info.set_code,
    number: info.number,
    image_ref: info.image_url,
    variant: String(cardId).split('_').pop() || '00',
  };
}

function loadFixtureCatalog(cardmaster, cardmap, localisation) {
  cache = buildIndex(cardmaster, cardmap, localisation);
  return cache;
}

module.exports = {
  IMAGE_PREFIX,
  RARITY_MAP,
  ensureCatalog,
  getCatalog,
  lookupCard,
  listCatalogCards,
  enrichCardRow,
  catalogFields,
  imageUrl,
  rarityIconUrl,
  setLogoUrl,
  loadFixtureCatalog,
  CATALOG_DIR,
};
