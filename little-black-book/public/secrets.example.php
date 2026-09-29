<?php
/**
 * secrets.example.php
 *
 * COPY THIS FILE to `secrets.php` on the server and fill in the real values.
 * `secrets.php` is git-ignored on purpose. NEVER put the real bot token,
 * database password, or dashboard password into git.
 *
 * On Hostinger: edit this in the File Manager after upload, then "Save As"
 * secrets.php in the same folder.
 */

return [
    // ---- Telegram ----------------------------------------------------------
    // The NEW bot token from @BotFather (looks like 123456789:AA...).
    'TELEGRAM_BOT_TOKEN' => 'PASTE_NEW_BOT_TOKEN_HERE',

    // A long random string you invent. Telegram sends it back on every
    // webhook call so strangers cannot POST fake updates. Make it 30+ random
    // characters. This is set when you run setup.php.
    'TELEGRAM_WEBHOOK_SECRET' => 'invent_a_long_random_string_here',

    // Your own Telegram numeric user id (optional but recommended). If set,
    // the bot only listens to YOU and ignores everyone else. Find it by
    // messaging @userinfobot on Telegram. Leave as null to accept anyone.
    'TELEGRAM_OWNER_ID' => null,

    // ---- Database (create these in Hostinger hPanel > Databases > MySQL) ---
    'DB_HOST' => 'localhost',
    'DB_NAME' => 'REPLACE_WITH_DB_NAME',
    'DB_USER' => 'REPLACE_WITH_DB_USER',
    'DB_PASS' => 'REPLACE_WITH_DB_PASSWORD',

    // ---- Dashboard login ---------------------------------------------------
    // The password you type to open the web dashboard. Pick something strong.
    'DASHBOARD_PASSWORD' => 'change_this_password',

    // ---- Connect other apps (Zapier, website forms, etc.) ------------------
    // A long random key. Any outside app that POSTs to api.php must send this
    // key, so only your own tools can push data in. Invent 30+ characters.
    'API_INGEST_KEY' => 'invent_another_long_random_string_here',

    // ---- Optional AI cleanup (leave blank to run rule-based only) ----------
    // If you paste an Anthropic API key here, brain dumps get an AI pass that
    // extracts fields more cleanly. WITHOUT a key the app still works fully
    // using simple pattern matching. Costs money per call, so it is OFF by
    // default. Leave as '' to keep it free.
    'ANTHROPIC_API_KEY' => '',
    'ANTHROPIC_MODEL' => 'claude-sonnet-5-5',
];
