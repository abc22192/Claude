<?php
/**
 * config.php — loads settings from secrets.php (or environment variables).
 *
 * Every entry file starts by requiring this. It refuses to run if secrets.php
 * is missing so you never accidentally serve the app unconfigured.
 */

// Guard: only load once, and only via our own entry files.
if (defined('LBB_CONFIG_LOADED')) {
    return $GLOBALS['LBB_CONFIG'];
}
define('LBB_CONFIG_LOADED', true);

date_default_timezone_set('America/New_York'); // adjust if you want a different clock

$secretsPath = __DIR__ . '/../secrets.php';

if (is_file($secretsPath)) {
    $config = require $secretsPath;
} else {
    // Fallback to environment variables (useful on a VPS). If neither exists,
    // most values will be empty and the app will show a clear setup message.
    $config = [
        'TELEGRAM_BOT_TOKEN'      => getenv('TELEGRAM_BOT_TOKEN') ?: '',
        'TELEGRAM_WEBHOOK_SECRET' => getenv('TELEGRAM_WEBHOOK_SECRET') ?: '',
        'TELEGRAM_OWNER_ID'       => getenv('TELEGRAM_OWNER_ID') ?: null,
        'DB_HOST'                 => getenv('DB_HOST') ?: 'localhost',
        'DB_NAME'                 => getenv('DB_NAME') ?: '',
        'DB_USER'                 => getenv('DB_USER') ?: '',
        'DB_PASS'                 => getenv('DB_PASS') ?: '',
        'DASHBOARD_PASSWORD'      => getenv('DASHBOARD_PASSWORD') ?: '',
        'ANTHROPIC_API_KEY'       => getenv('ANTHROPIC_API_KEY') ?: '',
        'ANTHROPIC_MODEL'         => getenv('ANTHROPIC_MODEL') ?: 'claude-sonnet-5-5',
    ];
}

if (!is_array($config)) {
    http_response_code(500);
    exit('Configuration error: secrets.php did not return an array.');
}

$GLOBALS['LBB_CONFIG'] = $config;

/** Small helper to read a config value with a default. */
function cfg(string $key, $default = null)
{
    return $GLOBALS['LBB_CONFIG'][$key] ?? $default;
}

return $config;
