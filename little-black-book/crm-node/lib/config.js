'use strict';
/**
 * config.js: everything the app reads from Hostinger's environment variables form.
 * Nothing secret is ever written to a file.
 */
const env = process.env;

const config = {
  version: '2.0.0',
  port: Number(env.PORT) || 3000,
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT) || 3306,
    database: env.DB_NAME || '',
    user: env.DB_USER || '',
    password: env.DB_PASSWORD || '',
  },
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret: env.SESSION_SECRET || '',
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    ownerId: env.TELEGRAM_OWNER_ID ? String(env.TELEGRAM_OWNER_ID).trim() : '',
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',
    apiBase: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
  },
  apiKey: env.API_KEY || '',
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModel: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  tz: env.APP_TZ || 'America/New_York',
  // Cookies are marked Secure unless explicitly turned off (local testing only).
  secureCookies: env.INSECURE_COOKIES !== '1',
  sessionDays: 90,
};

const MIN_PASSWORD = 10;

/** Plain-English list of what is wrong with the setup, shown on the health page. */
function problems() {
  const list = [];
  if (!config.db.database || !config.db.user) {
    list.push('DB_NAME and DB_USER are not filled in. Add them in the Environment Variables box on the Hostinger app screen.');
  }
  if (!config.adminPassword) {
    list.push('ADMIN_PASSWORD is missing. This is the password you type to open the app.');
  } else if (config.adminPassword.length < MIN_PASSWORD) {
    list.push(`ADMIN_PASSWORD is too short (${config.adminPassword.length} characters). Use at least ${MIN_PASSWORD}. This app holds private buyer information, so a short password is not allowed.`);
  }
  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    list.push('SESSION_SECRET is missing or too short. Use any random text of 16 or more characters. It keeps you logged in.');
  }
  return list;
}

module.exports = { config, problems, MIN_PASSWORD };
