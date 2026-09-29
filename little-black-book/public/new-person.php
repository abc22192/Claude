<?php
/**
 * new-person.php — manual create-new-person form. Search-before-create is
 * enforced: if a match on name/handle exists, we offer to open that person
 * instead of making a duplicate.
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/sorter.php';

$dupes = [];
$err = '';
if (($_POST['action'] ?? '') === 'create') {
    $name   = trim($_POST['name'] ?? '');
    $handle = trim($_POST['telegram_handle'] ?? '') ?: null;
    if ($name === '') {
        $err = 'Name is required.';
    } else {
        // Search first, never blindly insert.
        $matches = match_contact($name . ' ' . ($handle ?? ''));
        if ($matches && empty($_POST['force'])) {
            $dupes = $matches;
        } else {
            $id = create_contact($name, $handle);
            foreach (['chat_on', 'met_where', 'date_met', 'email'] as $f) {
                $v = trim($_POST[$f] ?? '');
                if ($v !== '') { q("UPDATE contacts SET $f = ? WHERE id = ?", [$v, $id]); }
            }
            header('Location: person.php?id=' . $id); exit;
        }
    }
}
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New person — Little Black Book</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap">
    <header class="topbar">
      <a class="muted" href="index.php">← Dashboard</a>
      <a class="muted" href="logout.php">Log out</a>
    </header>
    <h1>New person</h1>

    <?php if ($err): ?><p class="error"><?= htmlspecialchars($err) ?></p><?php endif; ?>

    <?php if ($dupes): ?>
      <div class="card">
        <p><strong>Possible duplicate.</strong> Open one, or force-create if these aren't the same person.</p>
        <ul class="list">
          <?php foreach ($dupes as $d): ?>
            <li><a href="person.php?id=<?= (int)$d['id'] ?>">
              <?= htmlspecialchars($d['name']) ?>
              <?php if ($d['telegram_handle']): ?> — <?= htmlspecialchars($d['telegram_handle']) ?><?php endif; ?>
            </a></li>
          <?php endforeach; ?>
        </ul>
        <form method="post">
          <?php foreach ($_POST as $k => $v): ?>
            <input type="hidden" name="<?= htmlspecialchars($k) ?>" value="<?= htmlspecialchars($v) ?>">
          <?php endforeach; ?>
          <input type="hidden" name="force" value="1">
          <button type="submit">Create anyway</button>
        </form>
      </div>
    <?php endif; ?>

    <form method="post" class="card">
      <input type="hidden" name="action" value="create">
      <div class="field"><label>Name *</label>
        <input name="name" required value="<?= htmlspecialchars($_POST['name'] ?? '') ?>" autofocus></div>
      <div class="field"><label>Telegram @handle</label>
        <input name="telegram_handle" value="<?= htmlspecialchars($_POST['telegram_handle'] ?? '') ?>"></div>
      <div class="field"><label>Chat on</label>
        <input name="chat_on" value="<?= htmlspecialchars($_POST['chat_on'] ?? '') ?>" placeholder="Telegram / OF / ATW / X / email"></div>
      <div class="field"><label>Met where</label>
        <input name="met_where" value="<?= htmlspecialchars($_POST['met_where'] ?? '') ?>"></div>
      <div class="field"><label>Date met</label>
        <input name="date_met" type="date" value="<?= htmlspecialchars($_POST['date_met'] ?? '') ?>"></div>
      <div class="field"><label>Email</label>
        <input name="email" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"></div>
      <button type="submit">Create</button>
      <a href="index.php" class="muted" style="margin-left:12px">Cancel</a>
    </form>
  </div>
</body></html>
