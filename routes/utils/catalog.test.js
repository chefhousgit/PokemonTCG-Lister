const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFixtureCatalog, lookupCard, enrichCardRow, imageUrl } = require('./catalog');

test('catalog lookup uses cardmaster name + rarity + image', () => {
  loadFixtureCatalog(
    {
      PK_10_000010_00: {
        Name: 'CARD_NAME_BULBASAUR',
        Rarity: 100,
        IllustrationID: 'cPK_10_000010_00_FUSHIGIDANE_C',
        ExpansionID: 'A1',
      },
    },
    { PK_10_000010_00: { ExpansionID: 'A1', CollectionNumber: 1 } },
    { CARD_NAME_BULBASAUR: 'Bulbasaur', EXPANSION_NAME_1: 'A1', EXPANSION_NAME_LONG_1: 'Genetic Apex' },
  );
  const info = lookupCard('PK_10_000010_00');
  assert.equal(info.name, 'Bulbasaur');
  assert.equal(info.set_code, 'A1');
  assert.equal(info.number, '1');
  assert.equal(info.rarity, 'C');
  assert.equal(info.image_url, imageUrl('cPK_10_000010_00_FUSHIGIDANE_C'));
});

test('enrich replaces unknown PK name from catalog', () => {
  loadFixtureCatalog(
    { PK_10_000020_00: { Name: 'Ivysaur', Rarity: 200, IllustrationID: 'ivy' } },
    { PK_10_000020_00: { ExpansionID: 'A1', CollectionNumber: 2 } },
    {},
  );
  const row = enrichCardRow({
    card_id: 'PK_10_000020_00',
    name: 'PK_10_000020_00',
    rarity: 'unknown',
    set_code: null,
  });
  assert.equal(row.name, 'Ivysaur');
  assert.equal(row.rarity, 'U');
  assert.equal(row.set_code, 'A1');
});
