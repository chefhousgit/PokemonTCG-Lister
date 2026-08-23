const path = require('path');
const fs = require('fs');

let impl = null;

function wrapPglite(db) {
  return {
    dialect: 'pglite',
    query: async (text, params = []) => {
      const res = await db.query(text, params);
      return { rows: res.rows || [], rowCount: (res.rows || []).length };
    },
    async transaction(fn) {
      const client = {
        query: async (text, params = []) => {
          const res = await db.query(text, params);
          return { rows: res.rows || [], rowCount: (res.rows || []).length };
        },
      };
      if (typeof db.transaction === 'function') {
        return db.transaction(async (tx) => {
          const tclient = {
            query: async (text, params = []) => {
              const res = await tx.query(text, params);
              return { rows: res.rows || [], rowCount: (res.rows || []).length };
            },
          };
          return fn(tclient);
        });
      }
      return fn(client);
    },
  };
}

function wrapPool(pool) {
  return {
    dialect: 'pg',
    query: (text, params) => pool.query(text, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function initDb() {
  if (impl) return impl;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    impl = wrapPool(new Pool({ connectionString: process.env.DATABASE_URL }));
    return impl;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = path.join(process.cwd(), '.data', 'pglite');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = typeof PGlite.create === 'function'
    ? await PGlite.create(dataDir)
    : await Promise.resolve(new PGlite(dataDir));
  impl = wrapPglite(db);
  return impl;
}

function getDb() {
  if (!impl) throw new Error('Database not initialized');
  return impl;
}

module.exports = { initDb, getDb };
