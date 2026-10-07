'use strict';
/**
 * db.js: one MySQL pool, plus plain-English explanations when the connection fails.
 * The app never crashes on a bad database login. It shows the explanation instead.
 */
const mysql = require('mysql2/promise');
const { config } = require('./config');

let pool = null;
let usedHost = null;
const state = { ok: false, error: null, explain: null, checkedAt: null };

function makePool(host) {
  const p = mysql.createPool({
    host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 6,
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    connectTimeout: 8000,
  });
  p.on('connection', (conn) => {
    conn.query("SET time_zone='+00:00'");
  });
  return p;
}

/** Turn a raw database error into a sentence Bella can act on. */
function explainDbError(err) {
  const code = err && (err.code || err.errno);
  const msg = (err && err.message) || String(err);
  if (code === 'ER_ACCESS_DENIED_ERROR' || /Access denied/i.test(msg)) {
    return 'The database refused the login. DB_USER or DB_PASSWORD does not match. In Hostinger go to Databases, MySQL Databases, press "Change password" on the database user, then paste the new password into DB_PASSWORD in the app\'s Environment Variables and redeploy.';
  }
  if (code === 'ER_BAD_DB_ERROR' || /Unknown database/i.test(msg)) {
    return 'The database name is wrong. Check DB_NAME against the exact name shown in Hostinger, Databases, MySQL Databases.';
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
    return 'The app could not reach the database server. Check DB_HOST (usually "localhost") and DB_PORT (usually 3306).';
  }
  if (code === 'ER_DBACCESS_DENIED_ERROR') {
    return 'The database user exists but has no rights on this database. In Hostinger, attach the user to the database with all privileges.';
  }
  return 'Database problem: ' + msg;
}

async function connect() {
  if (pool) return pool;
  const hosts = [config.db.host];
  if (config.db.host === 'localhost') hosts.push('127.0.0.1');
  let lastErr = null;
  for (const host of hosts) {
    const candidate = makePool(host);
    try {
      const conn = await candidate.getConnection();
      conn.release();
      pool = candidate;
      usedHost = host;
      state.ok = true;
      state.error = null;
      state.explain = null;
      state.checkedAt = new Date().toISOString();
      return pool;
    } catch (err) {
      lastErr = err;
      try { await candidate.end(); } catch (_) { /* ignore */ }
    }
  }
  state.ok = false;
  state.error = lastErr ? lastErr.message : 'unknown';
  state.explain = explainDbError(lastErr);
  state.checkedAt = new Date().toISOString();
  throw lastErr || new Error('Could not connect');
}

async function getPool() {
  if (pool) return pool;
  return connect();
}

async function query(sql, params) {
  const p = await getPool();
  const [rows] = await p.query(sql, params || []);
  return rows;
}

async function one(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** Run fn(conn) inside a transaction. conn.query returns rows. */
async function tx(fn) {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params) => {
      const [rows] = await conn.query(sql, params || []);
      return rows;
    };
    const result = await fn(q);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { query, one, tx, connect, close, state, explainDbError, usedHost: () => usedHost };
