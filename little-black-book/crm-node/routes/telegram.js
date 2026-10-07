'use strict';
const express = require('express');
const crypto = require('crypto');
const telegram = require('../lib/telegram');

const router = express.Router();

function same(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

router.post('/webhook/:secret', async (req, res) => {
  if (!telegram.configured() || !same(req.params.secret, telegram.secret())) return res.status(404).send('Not found');
  const header = req.get('x-telegram-bot-api-secret-token');
  if (header && !same(header, telegram.secret())) return res.status(404).send('Not found');
  try {
    await require('../server').ensureDb();
    await telegram.handleUpdate(req.body || {});
  } catch (err) {
    console.error('[telegram]', err && err.stack ? err.stack : err);
  }
  res.json({ ok: true }); // always answer 200 so Telegram does not retry forever
});

module.exports = { router };
