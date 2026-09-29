<?php
/**
 * dump.php — the CRM's own brain-dump entry, right in the web UI.
 *
 * Same loop as the Telegram bot: raw saved first, sorted second, ambiguous
 * ones go to the review queue with the "who is this?" prompt.
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/sorter.php';

$reply = '';
if (($_POST['action'] ?? '') === 'dump') {
    $text = trim($_POST['text'] ?? '');
    if ($text !== '') {
        $chatId = 'web:' . ($_SESSION['user'] ?? 'bella');
        $reply  = strip_tags(handle_dump($text, $chatId));
    }
}
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Brain dump — Little Black Book</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap">
    <header class="topbar">
      <a class="muted" href="index.php">← Dashboard</a>
      <a class="muted" href="logout.php">Log out</a>
    </header>
    <h1>🧠 Brain dump</h1>
    <p class="muted">Same as the Telegram bot: nothing gets lost. Ambiguous goes to review.</p>

    <?php if ($reply): ?>
      <div class="card ok"><?= htmlspecialchars($reply) ?></div>
    <?php endif; ?>

    <form method="post" class="card">
      <input type="hidden" name="action" value="dump">
      <div class="field">
        <label>Dump anything about a person</label>
        <textarea name="text" rows="8" autofocus placeholder="John messaged me on Telegram today, he's really into feet, said his dream night is a slow tease and countdown. Paid $50 for Bella Effect L2. Follow up next week."></textarea>
      </div>
      <button type="submit">Save &amp; sort</button>
      <a href="index.php" class="muted" style="margin-left:12px">Cancel</a>
    </form>

    <p class="muted small">Tip: start with <code>name: Their Name</code> on its own line
    to force the dump onto a specific person.</p>
  </div>
</body></html>
