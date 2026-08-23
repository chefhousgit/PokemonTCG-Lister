const express = require('express');
const ExcelJS = require('exceljs');
const { getDb } = require('./utils/db');

const router = express.Router();

async function listingRows(db) {
  const result = await db.query(
    `SELECT l.id, l.title, l.description, l.price, l.currency, l.status, l.external_id, l.adapter_name,
            c.name, c.card_id, c.set_code, c.number, c.rarity
     FROM listings l JOIN cards c ON c.id = l.card_id
     WHERE l.status IN ('draft', 'published')
     ORDER BY l.id`,
  );
  return result.rows;
}

router.get('/listings.csv', async (_req, res) => {
  const db = getDb();
  const rows = await listingRows(db);
  const header = 'id,title,name,card_id,set,number,rarity,price,status,external_id';
  const lines = rows.map((r) => [r.id, r.title, r.name, r.card_id, r.set_code, r.number, r.rarity, r.price, r.status, r.external_id]
    .map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`)
    .join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="listings.csv"');
  res.send([header, ...lines].join('\n'));
});

router.get('/listings.xlsx', async (_req, res) => {
  const db = getDb();
  const rows = await listingRows(db);
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Listings');
  sheet.columns = [
    { header: 'id', key: 'id' },
    { header: 'title', key: 'title', width: 40 },
    { header: 'name', key: 'name' },
    { header: 'card_id', key: 'card_id', width: 22 },
    { header: 'set', key: 'set_code' },
    { header: 'rarity', key: 'rarity' },
    { header: 'price', key: 'price' },
    { header: 'status', key: 'status' },
    { header: 'external_id', key: 'external_id' },
  ];
  rows.forEach((r) => sheet.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="listings.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
