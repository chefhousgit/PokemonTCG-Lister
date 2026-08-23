require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const { initDb } = require('./routes/utils/db');
const { migrate } = require('./scripts/migrate');
const { seedIfEmpty } = require('./scripts/seed');

const app = express();
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#0f1419">
<title>PokemonTCG Lister</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: #0f1419; color: #e8edf4; height: 100vh; display: flex; align-items: center; justify-content: center; }
  .container { width: 100%; max-width: 320px; padding: 0 24px; }
  .title { text-align: center; margin-bottom: 32px; }
  .title h1 { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px; }
  .title p { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 3px; color: #6b7a8d; margin-top: 4px; }
  form { display: flex; flex-direction: column; gap: 16px; }
  input[type="password"] { width: 100%; padding: 14px 16px; border-radius: 8px; border: 1px solid #2a3441; background: #1a2332; color: #e8edf4; font-family: 'JetBrains Mono', monospace; font-size: 14px; outline: none; }
  input[type="password"]:focus { border-color: #00d4aa; box-shadow: 0 0 0 1px #00d4aa; }
  button { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #00d4aa; color: #0f1419; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; min-height: 48px; }
  button:hover { background: #3dffc0; }
  .error { color: #f87171; font-size: 12px; text-align: center; font-family: 'JetBrains Mono', monospace; }
</style>
</head>
<body>
<div class="container">
  <div class="title">
    <h1>POKEMON TCG</h1>
    <p>LISTER</p>
  </div>
  <form method="POST" action="/auth/login">
    <input type="password" name="password" placeholder="Enter password" autofocus required>
    %%ERROR%%
    <button type="submit">Login</button>
  </form>
</div>
</body>
</html>`;

function requireAuth(req, res, next) {
  if (req.path.startsWith('/api/agent')) return next();
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return next();
  if (req.path === '/auth/login') return next();
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.send(LOGIN_PAGE_HTML.replace('%%ERROR%%', ''));
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      database: Boolean(process.env.DATABASE_URL),
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      agent: Boolean(process.env.AGENT_TOKEN),
    },
  });
});

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const loginFailures = new Map();

function loginThrottled(ip) {
  const rec = loginFailures.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(ip);
    return false;
  }
  return rec.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(ip) {
  const rec = loginFailures.get(ip);
  if (rec && Date.now() - rec.firstAt <= LOGIN_WINDOW_MS) rec.count += 1;
  else loginFailures.set(ip, { count: 1, firstAt: Date.now() });
}

app.post('/auth/login', express.urlencoded({ extended: false }), (req, res) => {
  const { password } = req.body;
  const appPassword = process.env.APP_PASSWORD;
  if (loginThrottled(req.ip)) {
    return res.status(429).send(LOGIN_PAGE_HTML.replace('%%ERROR%%', '<p class="error">Too many attempts — try again in 15 minutes</p>'));
  }
  if (!appPassword || password === appPassword) {
    loginFailures.delete(req.ip);
    req.session.authenticated = true;
    return res.redirect('/');
  }
  recordLoginFailure(req.ip);
  res.send(LOGIN_PAGE_HTML.replace('%%ERROR%%', '<p class="error">Incorrect password</p>'));
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.use(requireAuth);

app.use('/api/settings', require('./routes/settings'));
app.use('/api/imports', require('./routes/imports'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/export', require('./routes/export'));
app.use('/api/claude', require('./routes/claude'));

app.get('/api/meta', (_req, res) => {
  res.json({
    marketplace: process.env.MARKETPLACE_ADAPTER || 'manual',
    executor: process.env.TRADE_EXECUTOR || 'manual',
    eldorado: process.env.ELDORADO_ENABLED === 'true',
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  next();
});

const DIST_DIR = path.join(__dirname, 'client', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
if (process.env.NODE_ENV === 'production' || fs.existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => res.sendFile(DIST_INDEX));
}

async function main() {
  await initDb();
  await migrate();
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`PokemonTCG-Lister listening on ${PORT}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { app, main };
