const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, '../../../config/trade-rules.json');

function loadRules(filePath) {
  const raw = fs.readFileSync(filePath || DEFAULT_PATH, 'utf8');
  return JSON.parse(raw);
}

function evaluateTradeLegality(card, rules) {
  const reasons = [];
  const rarity = (card && card.rarity) || 'unknown';
  const eligible = rules.rarityEligibility || {};
  if (card && card.tradeable === false) {
    reasons.push('card_not_tradeable');
  }
  if (eligible[rarity] === false) {
    reasons.push(`rarity_ineligible:${rarity}`);
  }
  const setCode = card && card.set_code;
  const banned = (rules.perSetRestrictions || []).find((r) => r.set_code === setCode && r.blocked);
  if (banned) reasons.push(`set_restricted:${setCode}`);
  return { ok: reasons.length === 0, reasons };
}

function currencyCost(card, rules) {
  const rarity = (card && card.rarity) || 'unknown';
  const map = rules.currencyCostByRarity || {};
  return Number(map[rarity] || 0);
}

module.exports = { loadRules, evaluateTradeLegality, currencyCost };
