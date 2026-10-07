'use strict';
/**
 * migrate.js: creates and upgrades the tables on every start. Safe to run any number of times.
 * Every table starts with lbb_ so it can share a database with any other app without touching it.
 */
const db = require('./db');

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS lbb_people (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'new',
        tone TEXT NULL,
        dream_night TEXT NULL,
        fetishes TEXT NULL,
        magic_words TEXT NULL,
        likes_about_me TEXT NULL,
        call_me VARCHAR(255) NULL,
        felt TEXT NULL,
        plans TEXT NULL,
        notes MEDIUMTEXT NULL,
        purchases_text TEXT NULL,
        payment_method VARCHAR(40) NULL,
        payment_vibe VARCHAR(255) NULL,
        knows_audio TINYINT(1) NOT NULL DEFAULT 0,
        knows_bella_effect TINYINT(1) NOT NULL DEFAULT 0,
        knows_inhalers TINYINT(1) NOT NULL DEFAULT 0,
        red_flags TEXT NULL,
        green_flags TEXT NULL,
        email VARCHAR(191) NULL,
        date_met DATE NULL,
        last_contact DATE NULL,
        archived TINYINT(1) NOT NULL DEFAULT 0,
        source VARCHAR(40) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_name (name),
        KEY idx_status (status)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_platforms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        person_id INT NOT NULL,
        platform VARCHAR(30) NOT NULL,
        username VARCHAR(191) NULL,
        external_id VARCHAR(64) NULL,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        met_here TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_person (person_id),
        KEY idx_lookup (platform, username),
        KEY idx_external (external_id)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        person_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        kind VARCHAR(30) NOT NULL DEFAULT 'other',
        level VARCHAR(4) NULL,
        amount DECIMAL(10,2) NULL,
        platform VARCHAR(30) NULL,
        occurred_on DATE NULL,
        notes TEXT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'confirmed',
        unconfirmed_reason VARCHAR(500) NULL,
        source VARCHAR(40) NULL,
        raw_id INT NULL,
        import_key VARCHAR(80) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_import (import_key),
        KEY idx_person (person_id),
        KEY idx_date (occurred_on),
        KEY idx_status (status)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_interactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        person_id INT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        platform VARCHAR(30) NULL,
        summary MEDIUMTEXT NOT NULL,
        source VARCHAR(40) NULL,
        raw_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_person (person_id, occurred_at)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_raw (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(40) NOT NULL,
        text MEDIUMTEXT NOT NULL,
        person_id INT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'saved',
        proposal LONGTEXT NULL,
        meta TEXT NULL,
        received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_person (person_id)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_followups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        person_id INT NOT NULL,
        kind VARCHAR(20) NOT NULL,
        anchor_on DATE NULL,
        due_on DATE NULL,
        reason VARCHAR(255) NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        done_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_person (person_id),
        KEY idx_due (status, due_on)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        cadence VARCHAR(12) NOT NULL DEFAULT 'monthly',
        category VARCHAR(60) NULL,
        starts_on DATE NULL,
        ends_on DATE NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_settings (
        k VARCHAR(60) NOT NULL PRIMARY KEY,
        v TEXT NULL
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_changesets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        source VARCHAR(30) NULL,
        state VARCHAR(12) NOT NULL DEFAULT 'applied',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        undone_at DATETIME NULL,
        KEY idx_state (state, id)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS lbb_changerows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        set_id INT NOT NULL,
        ord INT NOT NULL,
        tbl VARCHAR(30) NOT NULL,
        row_id INT NOT NULL,
        op VARCHAR(8) NOT NULL,
        before_json LONGTEXT NULL,
        after_json LONGTEXT NULL,
        KEY idx_set (set_id, ord)
      ) ${T}`,
    ],
  },
];

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS lbb_meta (k VARCHAR(40) NOT NULL PRIMARY KEY, v VARCHAR(40) NOT NULL) ${T}`);
  const row = await db.one("SELECT v FROM lbb_meta WHERE k = 'schema_version'");
  let current = row ? Number(row.v) : 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    for (const sql of m.statements) await db.query(sql);
    await db.query(
      "INSERT INTO lbb_meta (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
      [String(m.version)]
    );
    current = m.version;
  }
  return current;
}

module.exports = { migrate, MIGRATIONS };
