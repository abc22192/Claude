<?php
/**
 * install.php — friendly setup form. No code editing required.
 *
 * If secrets.php doesn't exist yet, this shows a form. Fill it in, submit,
 * and it writes secrets.php for you. Then click through to run setup.php
 * (which creates the database tables and connects Telegram).
 *
 * Once secrets.php exists, this page refuses to run so it can't be used to
 * overwrite it later.
 */

$secretsPath = __DIR__ . '/secrets.php';
$alreadyDone = is_file($secretsPath);

// Small helper: generate a safe random string for webhook secrets and API keys.
function lbb_rand(int $len = 40): string
{
    return rtrim(strtr(base64_encode(random_bytes($len)), '+/', '-_'), '=');
}

$errors = [];
$saved  = false;

if (!$alreadyDone && ($_POST['action'] ?? '') === 'save') {
    // Read everything the user typed. Trim it. Blank stays blank.
    $vals = [
        'DASHBOARD_PASSWORD'      => trim($_POST['DASHBOARD_PASSWORD'] ?? ''),
        'TELEGRAM_BOT_TOKEN'      => trim($_POST['TELEGRAM_BOT_TOKEN'] ?? ''),
        'TELEGRAM_OWNER_ID'       => trim($_POST['TELEGRAM_OWNER_ID'] ?? ''),
        'DB_HOST'                 => trim($_POST['DB_HOST'] ?? 'localhost'),
        'DB_NAME'                 => trim($_POST['DB_NAME'] ?? ''),
        'DB_USER'                 => trim($_POST['DB_USER'] ?? ''),
        'DB_PASS'                 => trim($_POST['DB_PASS'] ?? ''),
        'ANTHROPIC_API_KEY'       => trim($_POST['ANTHROPIC_API_KEY'] ?? ''),
        // These two get auto-generated so she never has to invent random strings.
        'TELEGRAM_WEBHOOK_SECRET' => lbb_rand(30),
        'API_INGEST_KEY'          => lbb_rand(30),
        'ANTHROPIC_MODEL'         => 'claude-sonnet-5-5',
    ];

    // Only two things are actually required to log in and reach the dashboard.
    if ($vals['DASHBOARD_PASSWORD'] === '') {
        $errors[] = 'Pick a password to open the dashboard.';
    } elseif (strlen($vals['DASHBOARD_PASSWORD']) < 8) {
        $errors[] = 'Dashboard password should be at least 8 characters.';
    }
    if ($vals['DB_NAME'] === '' || $vals['DB_USER'] === '' || $vals['DB_PASS'] === '') {
        $errors[] = 'Fill in all three database fields (name, user, password).';
    }
    // Telegram fields are optional — you can add them later by re-running install
    // (once you delete secrets.php) or by editing the file. Everything else works.

    if (!$errors) {
        // Turn null-ish into real null in the file.
        $ownerLine = $vals['TELEGRAM_OWNER_ID'] === '' ? 'null' : var_export($vals['TELEGRAM_OWNER_ID'], true);

        // Assemble the file. var_export handles all escaping safely.
        $body = "<?php\n"
              . "// Written by install.php. Safe to edit manually, but keep the format.\n"
              . "// This file is git-ignored on purpose. Never share its contents.\n"
              . "return [\n"
              . "    'TELEGRAM_BOT_TOKEN'      => " . var_export($vals['TELEGRAM_BOT_TOKEN'], true) . ",\n"
              . "    'TELEGRAM_WEBHOOK_SECRET' => " . var_export($vals['TELEGRAM_WEBHOOK_SECRET'], true) . ",\n"
              . "    'TELEGRAM_OWNER_ID'       => " . $ownerLine . ",\n"
              . "    'DB_HOST'                 => " . var_export($vals['DB_HOST'], true) . ",\n"
              . "    'DB_NAME'                 => " . var_export($vals['DB_NAME'], true) . ",\n"
              . "    'DB_USER'                 => " . var_export($vals['DB_USER'], true) . ",\n"
              . "    'DB_PASS'                 => " . var_export($vals['DB_PASS'], true) . ",\n"
              . "    'DASHBOARD_PASSWORD'      => " . var_export($vals['DASHBOARD_PASSWORD'], true) . ",\n"
              . "    'API_INGEST_KEY'          => " . var_export($vals['API_INGEST_KEY'], true) . ",\n"
              . "    'ANTHROPIC_API_KEY'       => " . var_export($vals['ANTHROPIC_API_KEY'], true) . ",\n"
              . "    'ANTHROPIC_MODEL'         => " . var_export($vals['ANTHROPIC_MODEL'], true) . ",\n"
              . "];\n";

        if (@file_put_contents($secretsPath, $body) !== false) {
            @chmod($secretsPath, 0600); // best-effort tighten permissions
            $saved = true;
        } else {
            $errors[] = 'Could not write secrets.php. Check that the folder is writable in File Manager.';
        }
    }
}

// If saved (or already existed), show a success page.
$showSuccess = $saved || $alreadyDone;
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Little Black Book — Setup</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap" style="max-width:720px">

    <h1>📓 One-time setup</h1>

    <?php if ($showSuccess): ?>
      <div class="card ok" style="border-color: var(--ok);">
        <p><strong>✅ <?= $saved ? 'Saved.' : 'Already set up.' ?></strong></p>
        <p>Two clicks left:</p>
        <ol>
          <li><a href="setup.php">Click here to build the database tables and connect Telegram →</a></li>
          <li>After that, <a href="index.php">open the dashboard</a> and log in with the password you picked.</li>
        </ol>
        <?php if ($saved): ?>
          <p class="muted small">Now delete <code>install.php</code> from File Manager
          so nobody else can rerun it. Right-click the file → Delete.</p>
        <?php endif; ?>
      </div>
    <?php else: ?>
      <p class="muted">Fill this in once. It writes your settings and gets out of your way.
      Fields marked with <span class="pill">required</span> must be filled. The rest can wait.</p>

      <?php if ($errors): ?>
        <div class="card" style="border-color: var(--err);">
          <p class="error"><strong>Fix these first:</strong></p>
          <ul><?php foreach ($errors as $e): ?><li class="error"><?= htmlspecialchars($e) ?></li><?php endforeach; ?></ul>
        </div>
      <?php endif; ?>

      <form method="post" class="card">
        <input type="hidden" name="action" value="save">

        <h2>Your login <span class="pill">required</span></h2>
        <div class="field">
          <label>Pick a password to open the dashboard</label>
          <input name="DASHBOARD_PASSWORD" type="text" required minlength="8"
                 value="<?= htmlspecialchars($_POST['DASHBOARD_PASSWORD'] ?? '') ?>"
                 placeholder="At least 8 characters. Save this in your password manager.">
        </div>

        <h2>Database <span class="pill">required</span></h2>
        <p class="muted small">Copy these three from Hostinger → Databases → MySQL Databases. You already made this database.</p>
        <div class="field"><label>DB name</label>
          <input name="DB_NAME" required value="<?= htmlspecialchars($_POST['DB_NAME'] ?? 'u953797100_crm') ?>"></div>
        <div class="field"><label>DB user</label>
          <input name="DB_USER" required value="<?= htmlspecialchars($_POST['DB_USER'] ?? 'u953797100_crmuser') ?>"></div>
        <div class="field"><label>DB password</label>
          <input name="DB_PASS" required value="<?= htmlspecialchars($_POST['DB_PASS'] ?? '') ?>"
                 placeholder="The password Hostinger showed when you made the database"></div>
        <div class="field"><label>DB host</label>
          <input name="DB_HOST" value="<?= htmlspecialchars($_POST['DB_HOST'] ?? 'localhost') ?>"></div>

        <h2>Telegram bot <span class="muted small">(optional now, add later if not ready)</span></h2>
        <div class="field"><label>Bot token from @BotFather</label>
          <input name="TELEGRAM_BOT_TOKEN" value="<?= htmlspecialchars($_POST['TELEGRAM_BOT_TOKEN'] ?? '') ?>"
                 placeholder="123456789:AA...">
        </div>
        <div class="field"><label>Your Telegram numeric ID <span class="muted small">(from @userinfobot — locks bot to you only)</span></label>
          <input name="TELEGRAM_OWNER_ID" value="<?= htmlspecialchars($_POST['TELEGRAM_OWNER_ID'] ?? '') ?>"
                 placeholder="Leave blank to skip">
        </div>

        <h2>Optional AI polish <span class="muted small">(leave blank to save money)</span></h2>
        <div class="field"><label>Anthropic API key</label>
          <input name="ANTHROPIC_API_KEY" value="<?= htmlspecialchars($_POST['ANTHROPIC_API_KEY'] ?? '') ?>"
                 placeholder="sk-ant-... (leave blank — the CRM works fully without it)">
        </div>

        <button type="submit">Save settings</button>
        <p class="muted small" style="margin-top:14px">
          The random webhook secret and API-connect key are auto-generated for you.
          Nothing here goes anywhere but your own server.
        </p>
      </form>
    <?php endif; ?>

  </div>
</body></html>
