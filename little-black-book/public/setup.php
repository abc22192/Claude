<?php
/**
 * setup.php — run this ONCE after uploading and filling in secrets.php.
 *
 * It: (1) creates the database tables, and (2) registers the Telegram webhook
 * so messages start flowing to webhook.php. Password-protected like the rest.
 *
 * After it says "All set", you can leave it in place (it's safe to re-run) or
 * delete it.
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/sorter.php';

$log = [];

// Work out this site's own https URL so we can tell Telegram where to POST.
$scheme  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host    = $_SERVER['HTTP_HOST'] ?? 'localhost';
$dir     = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
$webhookUrl = "{$scheme}://{$host}{$dir}/webhook.php";

if (($_POST['action'] ?? '') === 'run') {
    // 1) Tables.
    try {
        ensure_schema();
        $log[] = ['ok', 'Database tables created / verified.'];
    } catch (Throwable $e) {
        $log[] = ['err', 'Could not create tables: ' . $e->getMessage()];
    }

    // 2) Telegram webhook.
    $token = cfg('TELEGRAM_BOT_TOKEN', '');
    if ($token === '' || $token === 'PASTE_NEW_BOT_TOKEN_HERE') {
        $log[] = ['err', 'No bot token set in secrets.php yet.'];
    } else {
        $res = tg('setWebhook', [
            'url'            => $webhookUrl,
            'secret_token'   => cfg('TELEGRAM_WEBHOOK_SECRET', ''),
            'allowed_updates'=> json_encode(['message', 'edited_message']),
        ]);
        if ($res && ($res['ok'] ?? false)) {
            $log[] = ['ok', 'Telegram webhook set to ' . $webhookUrl];
        } else {
            $log[] = ['err', 'Telegram rejected the webhook: ' . json_encode($res)];
        }
        $info = tg('getWebhookInfo');
        if ($info && ($info['ok'] ?? false)) {
            $log[] = ['ok', 'Telegram confirms URL: ' . ($info['result']['url'] ?? '(none)')];
        }
    }
}
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Little Black Book — Setup</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap">
    <h1>📓 Setup</h1>
    <p class="muted">Do this once after filling in <code>secrets.php</code>.</p>

    <?php foreach ($log as [$type, $msg]): ?>
      <p class="<?= $type === 'ok' ? 'ok' : 'error' ?>">
        <?= $type === 'ok' ? '✅' : '⚠️' ?> <?= htmlspecialchars($msg) ?>
      </p>
    <?php endforeach; ?>

    <p>Webhook will be set to:<br><code><?= htmlspecialchars($webhookUrl) ?></code></p>

    <form method="post">
      <input type="hidden" name="action" value="run">
      <button type="submit">Create tables &amp; connect Telegram</button>
    </form>

    <p style="margin-top:24px"><a href="index.php">→ Open the dashboard</a></p>
  </div>
</body></html>
