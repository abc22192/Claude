'use strict';
/**
 * Little Black Book: private relationship memory.
 * Entry file for Hostinger's "Deploy an app" (Node). Start command: npm start.
 */
const path = require('path');
const express = require('express');
const { config, problems } = require('./lib/config');
const db = require('./lib/db');
const { migrate } = require('./lib/migrate');
const auth = require('./lib/auth');
const { html, barePage } = require('./lib/html');
const { wrap, handleError } = require('./lib/http');

const PUBLIC = path.join(__dirname, 'public');
let lastTry = 0;
let migrated = false;

/** Make sure the database is reachable and up to date. Returns true when ready. */
async function ensureDb() {
  if (db.state.ok && migrated) return true;
  if (Date.now() - lastTry < 4000 && !db.state.ok) return false;
  lastTry = Date.now();
  try {
    await db.connect();
    await migrate();
    migrated = true;
    return true;
  } catch (err) {
    db.state.ok = false;
    db.state.error = err.message;
    db.state.explain = db.explainDbError(err);
    return false;
  }
}

function setupPage(res, status) {
  const issues = problems();
  const list = [...issues];
  if (db.state.explain && !list.some((l) => l.startsWith('DB_NAME'))) list.push(db.state.explain);
  res.status(status || 503).send(barePage('Almost ready', html`<div class="login">
    <img class="cover" src="/static/book-cover.png" alt="">
    <h1>Almost ready</h1>
    <p class="muted">The app is running, but one setup step is not finished. Nothing is lost.</p>
    <div class="card" style="text-align:left">
      ${list.length ? list.map((l) => html`<p>• ${l}</p>`) : html`<p>Still connecting to the database. Refresh in a few seconds.</p>`}
    </div>
    <p class="faint small">After fixing it in Hostinger, press Redeploy, then refresh this page.</p>
  </div>`));
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
    });
    next();
  });

  app.use('/static', express.static(PUBLIC, { maxAge: '7d', setHeaders: (res) => res.set('Cache-Control', 'public, max-age=604800') }));
  app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(PUBLIC, 'manifest.webmanifest')));
  app.get('/favicon.ico', (req, res) => res.redirect('/static/icon-192.png'));

  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));

  // Health check for Hostinger and for her: never needs a login, never shows secrets.
  app.get('/health', wrap(async (req, res) => {
    const ready = await ensureDb();
    res.status(ready ? 200 : 503).json({ ok: ready, version: config.version, database: ready ? 'connected' : 'not connected', setup: problems().length ? 'incomplete' : 'complete' });
  }));

  // Telegram and the public API run before the login wall. They have their own keys.
  app.use('/telegram', require('./routes/telegram').router);
  app.use('/api', require('./routes/api').router);

  // Everything else needs a working database first.
  app.use(wrap(async (req, res, next) => {
    if (await ensureDb()) return next();
    return setupPage(res, 503);
  }));

  app.use(auth.attachSession);
  app.use('/', require('./routes/auth').router);
  app.use(auth.requireLogin);
  app.use(auth.csrfProtect);

  app.use('/', require('./routes/today').router);
  app.use('/people', require('./routes/people').router);
  app.use('/followups', require('./routes/followups').router);
  app.use('/money', require('./routes/money').router);
  app.use('/dump', require('./routes/dump').router);
  app.use('/', require('./routes/more').router);

  app.use((req, res) => res.status(404).send('Not found'));
  app.use((err, req, res, next) => handleError(err, req, res));
  return app;
}

async function start() {
  const app = createApp();
  const server = app.listen(config.port, () => console.log(`Little Black Book ${config.version} listening on ${config.port}`));
  ensureDb().then((ok) => {
    console.log(ok ? 'Database ready.' : 'Database not ready yet: ' + (db.state.explain || 'unknown'));
    if (ok) require('./lib/telegram').autoSetup().catch((e) => console.log('Telegram setup skipped:', e.message));
  });
  const shutdown = () => { server.close(() => db.close().finally(() => process.exit(0))); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { createApp, ensureDb, start };
