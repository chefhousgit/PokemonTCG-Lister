const fs = require('fs');
const path = require('path');
const { initDb, getDb } = require('../routes/utils/db');

async function migrate() {
  await initDb();
  const db = getDb();
  const dir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await db.query(statement);
    }
    console.log(`[migrate] applied ${file}`);
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { migrate };
