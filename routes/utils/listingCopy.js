const fs = require('fs');
const path = require('path');

function templates() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/listing-templates.json'), 'utf8'));
}

function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ''));
}

function draftCopy(card, sellable) {
  const t = templates();
  const vars = {
    name: card.name,
    set: card.set_code || '',
    number: card.number || '',
    rarity: card.rarity || '',
    variant: card.variant || '00',
    sellable: sellable != null ? sellable : '',
  };
  return {
    title: fill(t.title, vars).trim(),
    description: `${fill(t.description, vars)}\n\n${t.footer}`.trim(),
  };
}

module.exports = { draftCopy, templates };
