const { ensureCatalog, CATALOG_DIR } = require('../routes/utils/catalog');

async function main() {
  const catalog = await ensureCatalog({ force: true });
  const count = Object.keys(catalog.cards || {}).length;
  console.log(`[catalog] wrote ${count} cards to ${CATALOG_DIR}`);
  console.log(`[catalog] ${catalog.expansions.length} expansions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
