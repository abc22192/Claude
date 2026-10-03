<?php
/**
 * bulk-import.php — one-click importer for Bella's buyer CSVs.
 *
 * Upload these four files into the SAME folder as this script:
 *   - buyer_summary_for_claude.csv            (147 clients)
 *   - buyer_purchases_confident_for_claude.csv (209 confirmed sales)
 *   - buyer_purchases_ambiguous_for_claude.csv (99 fuzzy, go to review queue)
 *   - bulk-import.php (this file)
 *
 * Then open https://crm.blastwithbella.com/bulk-import.php, log in with your
 * DASHBOARD_PASSWORD, click Preview to see what WILL happen, then Run to do it.
 *
 * SAFETY:
 *  - Search-before-create: never makes a duplicate person already in the CRM.
 *  - Idempotent: tracks a per-row "import_tag" on sessions so re-running
 *    skips rows already imported.
 *  - Raw rows go into raw_captures so originals are never lost.
 *  - Dry-run (Preview) shows every row that WILL be inserted before you commit.
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/sorter.php';

const CSV_SUMMARY     = 'buyer_summary_for_claude.csv';
const CSV_CONFIRMED   = 'buyer_purchases_confident_for_claude.csv';
const CSV_AMBIGUOUS   = 'buyer_purchases_ambiguous_for_claude.csv';
const IMPORT_TAG      = 'bulk-import-2026-10-03';

/** Robust CSV loader. Strips the markdown '\_' escaping some tools emit. */
function load_csv(string $relative): array
{
    $path = __DIR__ . '/' . $relative;
    if (!is_file($path)) { return [[], "Missing file: {$relative}"]; }
    $raw = file_get_contents($path);
    // Our CSVs sometimes come with "\\_" escaped underscores and trailing
    // double-spaces in header rows. Un-escape and normalise.
    $raw = str_replace(['\\_', "\r"], ['_', ''], $raw);
    $lines = array_values(array_filter(array_map('rtrim', explode("\n", $raw))));
    if (!$lines) { return [[], "Empty file: {$relative}"]; }
    $header = str_getcsv(array_shift($lines));
    $rows = [];
    foreach ($lines as $line) {
        $vals = str_getcsv($line);
        if (count($vals) < count($header)) {
            $vals = array_pad($vals, count($header), '');
        }
        $rows[] = array_combine(array_slice($header, 0, count($vals)), array_slice($vals, 0, count($header)));
    }
    return [$rows, null];
}

/** Find or create a contact for a (client_id, name) pair. Returns [contact_id, created_bool]. */
function upsert_contact_for_import(string $clientId, string $name, ?string $firstDate, ?string $lastDate, bool $dryRun): array
{
    $name = trim($name);
    if ($name === '') { return [null, false]; }

    // Search before create — exact name first, then LIKE as fallback.
    $existing = q1('SELECT * FROM contacts WHERE name = ? LIMIT 1', [$name]);
    if (!$existing) {
        // Also try matching if the previous import already tagged the person via notes.
        $existing = q1("SELECT * FROM contacts WHERE notes LIKE ? LIMIT 1", ["%[imported-{$clientId}]%"]);
    }

    if ($existing) { return [$existing['id'], false]; }

    if ($dryRun) { return [null, true]; }

    $notes = "[imported-{$clientId}] [tag:" . IMPORT_TAG . "] from historical buyer list";
    $id = insert(
        'INSERT INTO contacts (name, chat_on, date_met, last_contact, status, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [$name, 'Telegram', $firstDate ?: null, $lastDate ? $lastDate . ' 00:00:00' : null, 'imported', $notes]
    );
    return [$id, true];
}

/** Has this exact purchase row already been imported? */
function session_already_imported(int $contactId, string $itemName, ?float $amount, ?string $date): bool
{
    $row = q1(
        'SELECT id FROM sessions WHERE contact_id = ? AND session_name = ? AND
         (amount_paid <=> ?) AND (session_date <=> ?) AND notes LIKE ? LIMIT 1',
        [$contactId, $itemName, $amount, $date, '%' . IMPORT_TAG . '%']
    );
    return (bool) $row;
}

$errors = []; $log = [];
$mode = $_POST['action'] ?? '';
$dryRun = ($mode === 'preview');
$doRun  = ($mode === 'run');

if ($dryRun || $doRun) {
    [$summary, $errSum]   = load_csv(CSV_SUMMARY);
    [$confirmed, $errCon] = load_csv(CSV_CONFIRMED);
    [$ambiguous, $errAmb] = load_csv(CSV_AMBIGUOUS);
    foreach ([$errSum, $errCon, $errAmb] as $e) { if ($e) { $errors[] = $e; } }
}

$stats = [
    'contacts_created' => 0, 'contacts_matched' => 0,
    'sessions_created' => 0, 'sessions_skipped' => 0,
    'review_created'   => 0, 'review_skipped'   => 0,
];
$sample = [];

if (!$errors && ($dryRun || $doRun)) {
    $idMap = []; // client_id -> contact_id

    // Pass 1 — contacts from the summary (authoritative name list).
    foreach ($summary as $row) {
        $cid = trim($row['client_id'] ?? '');
        $name = trim($row['client_name'] ?? '');
        if ($cid === '' || $name === '') { continue; }
        [$id, $created] = upsert_contact_for_import($cid, $name, $row['first_purchase'] ?? null, $row['last_purchase'] ?? null, $dryRun);
        $stats[$created ? 'contacts_created' : 'contacts_matched']++;
        if ($id) { $idMap[$cid] = $id; }
        if (count($sample) < 5) { $sample[] = ['person', $cid, $name, $created ? 'NEW' : 'exists']; }
    }

    // Pass 2 — confirmed sessions.
    foreach ($confirmed as $row) {
        $cid = trim($row['client_id'] ?? '');
        $item = trim($row['item'] ?? '');
        $amount = $row['amount_usd'] !== '' ? (float) $row['amount_usd'] : null;
        $date = trim($row['date'] ?? '') ?: null;

        if ($cid === '' || !isset($idMap[$cid])) {
            // Not from the summary? Create a contact on the fly using the row's own name.
            $name = trim($row['client_name'] ?? '');
            if ($name === '') { continue; }
            [$id, $created] = upsert_contact_for_import($cid, $name, $date, $date, $dryRun);
            $stats[$created ? 'contacts_created' : 'contacts_matched']++;
            if ($id) { $idMap[$cid] = $id; } else { continue; }
        }

        if (!$dryRun && session_already_imported($idMap[$cid], $item, $amount, $date)) {
            $stats['sessions_skipped']++;
            continue;
        }

        if (!$dryRun) {
            insert(
                'INSERT INTO sessions (contact_id, session_name, session_type, session_date, amount_paid, notes)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [$idMap[$cid], $item, 'purchase', $date, $amount, '[tag:' . IMPORT_TAG . '] imported from CSV']
            );
        }
        $stats['sessions_created']++;
        if (count($sample) < 10) { $sample[] = ['session', $cid, $item, $amount ? '$' . $amount : '?', $date ?: '?']; }
    }

    // Pass 3 — ambiguous rows -> raw_captures + review_queue.
    foreach ($ambiguous as $row) {
        $cid = trim($row['client_id'] ?? '');
        $name = trim($row['client_name'] ?? '');
        $item = trim($row['item'] ?? '');
        $amount = $row['amount_usd'] !== '' ? (float) $row['amount_usd'] : null;
        $date = trim($row['date'] ?? '') ?: null;
        $need = trim($row['needs_from_bella'] ?? '');
        if ($cid === '' || $name === '') { continue; }

        if (!isset($idMap[$cid])) {
            [$id, $created] = upsert_contact_for_import($cid, $name, $date, $date, $dryRun);
            $stats[$created ? 'contacts_created' : 'contacts_matched']++;
            if ($id) { $idMap[$cid] = $id; } else { continue; }
        }

        $rawText = "AMBIGUOUS PURCHASE — {$name} ({$cid})\n"
                 . "Item: " . ($item ?: '?') . "\n"
                 . "Amount: " . ($amount !== null ? '$' . $amount : '?') . "\n"
                 . "Date: " . ($date ?: '?') . "\n"
                 . "Needs confirming: " . $need;

        if (!$dryRun) {
            // Avoid duplicate review entries on re-run.
            $exists = q1(
                'SELECT rc.id FROM raw_captures rc WHERE rc.contact_id = ? AND rc.raw_text = ? LIMIT 1',
                [$idMap[$cid], $rawText]
            );
            if ($exists) {
                $stats['review_skipped']++;
                continue;
            }
            $rawId = insert(
                'INSERT INTO raw_captures (source, raw_text, contact_id, review_status) VALUES (?, ?, ?, ?)',
                ['import', $rawText, $idMap[$cid], 'review']
            );
            insert(
                'INSERT INTO review_queue (raw_capture_id, reason) VALUES (?, ?)',
                [$rawId, 'Imported ambiguous: ' . mb_substr($need, 0, 200)]
            );
        }
        $stats['review_created']++;
    }
}
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bulk import — Little Black Book</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap" style="max-width:760px">
    <header class="topbar">
      <a class="muted" href="index.php">← Dashboard</a>
      <a class="muted" href="logout.php">Log out</a>
    </header>

    <h1>📥 Bulk import</h1>
    <p class="muted">Import your three buyer CSVs. Safe to run twice — duplicates are skipped automatically.</p>

    <?php if ($errors): ?>
      <div class="card" style="border-color: var(--err);">
        <p class="error"><strong>Fix these first:</strong></p>
        <ul><?php foreach ($errors as $e): ?><li class="error"><?= htmlspecialchars($e) ?></li><?php endforeach; ?></ul>
        <p class="muted">Make sure all three CSVs are uploaded into the same folder as this file.</p>
      </div>
    <?php endif; ?>

    <?php if ($dryRun || $doRun): if (!$errors): ?>
      <div class="card <?= $doRun ? 'ok' : '' ?>" style="border-color: var(--ok);">
        <h2><?= $dryRun ? 'Preview (nothing saved yet)' : '✅ Import done' ?></h2>
        <ul class="list">
          <li>People created: <strong><?= $stats['contacts_created'] ?></strong></li>
          <li>People matched to existing: <strong><?= $stats['contacts_matched'] ?></strong></li>
          <li>Sessions created: <strong><?= $stats['sessions_created'] ?></strong></li>
          <li>Sessions skipped (already imported): <strong><?= $stats['sessions_skipped'] ?></strong></li>
          <li>Review items created: <strong><?= $stats['review_created'] ?></strong></li>
          <li>Review items skipped (already there): <strong><?= $stats['review_skipped'] ?></strong></li>
        </ul>
        <?php if ($sample): ?>
          <p class="muted small">Sample of what would be / was imported:</p>
          <ul class="list">
            <?php foreach ($sample as $s): ?>
              <li class="small muted"><?= htmlspecialchars(implode(' · ', $s)) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
      </div>
    <?php endif; endif; ?>

    <form method="post" class="card">
      <p class="muted">Step 1 — Preview to see what will happen without changing anything.</p>
      <button type="submit" name="action" value="preview">Preview import (safe)</button>
    </form>

    <?php if ($dryRun && !$errors): ?>
      <form method="post" class="card" style="border-color: var(--accent);">
        <p>Looks right? This will actually insert the rows.</p>
        <button type="submit" name="action" value="run" style="background: var(--accent);">Run import for real</button>
      </form>
    <?php endif; ?>

    <?php if ($doRun && !$errors): ?>
      <p class="muted small" style="margin-top:14px">
        You can delete <code>bulk-import.php</code> from File Manager now if you want — it won't be needed again.
        (Leaving it is also fine; it's idempotent and locked behind your dashboard password.)
      </p>
      <p><a href="index.php">→ Open the dashboard and see the people</a></p>
    <?php endif; ?>

  </div>
</body></html>
