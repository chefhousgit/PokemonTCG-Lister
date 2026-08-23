const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUT = path.join(__dirname, '../data/card-catalog');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cardmap = await axios.get('https://leanny.github.io/pocket_tcg_resources/data/cardmap.json');
  fs.writeFileSync(path.join(OUT, 'cardmap.json'), JSON.stringify(cardmap.data));
  try {
    const cards = await axios.get('https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json');
    fs.writeFileSync(path.join(OUT, 'cards.json'), JSON.stringify(cards.data));
  } catch (err) {
    console.warn('[catalog] cards.json download failed:', err.message);
  }
  console.log('[catalog] wrote', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
