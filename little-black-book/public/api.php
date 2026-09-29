<?php
/**
 * api.php — let other apps push data into the Little Black Book.
 *
 * This is how you connect a website form, Zapier, or any other app to the CRM.
 * The outside app sends an HTTP POST here with your API key. No key = rejected.
 *
 * Two things you can send:
 *   1) A brain dump (free text) -> gets sorted exactly like a Telegram message.
 *   2) A structured contact      -> creates or updates a person's fields.
 *
 * Examples (curl):
 *   curl -X POST https://crm.bellablasts.com/api.php \
 *     -H "X-API-Key: YOUR_KEY" \
 *     -d 'type=dump' -d 'text=met a new whale @joe, calls me goddess'
 *
 *   curl -X POST https://crm.bellablasts.com/api.php \
 *     -H "X-API-Key: YOUR_KEY" \
 *     -d 'type=contact' -d 'name=Joe' -d 'telegram_handle=@joe' -d 'dream_night=beach'
 *
 * In Zapier: use a "Webhooks by Zapier -> POST" step to this URL, add the
 * X-API-Key header, and map fields into the body.
 */

require_once __DIR__ . '/app/sorter.php';

header('Content-Type: application/json');

function api_fail(int $code, string $msg): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

// 1) Only POST.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    api_fail(405, 'POST only');
}

// 2) Key check. Accept header or a "key" field. Also accept a JSON body.
$body = [];
$rawBody = file_get_contents('php://input');
if ($rawBody && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
    $body = json_decode($rawBody, true) ?: [];
}
$input = array_merge($_POST, $body);

$expected = cfg('API_INGEST_KEY', '');
$got = $_SERVER['HTTP_X_API_KEY'] ?? ($input['key'] ?? '');
if ($expected === '' || !hash_equals($expected, (string) $got)) {
    api_fail(403, 'bad or missing API key');
}

$type = strtolower(trim($input['type'] ?? 'dump'));

// --- A brain dump from an outside source -------------------------------------
if ($type === 'dump') {
    $text = trim($input['text'] ?? '');
    if ($text === '') {
        api_fail(422, 'missing text');
    }
    // Reuse the exact same loop the bot uses. A stable per-source chat id keeps
    // the "who is this about" context working for repeated posts from one app.
    $chatId = 'api:' . preg_replace('/[^a-z0-9_]+/i', '', $input['source'] ?? 'web');
    $reply  = handle_dump($text, $chatId);
    echo json_encode(['ok' => true, 'result' => strip_tags($reply)]);
    exit;
}

// --- A structured contact upsert ---------------------------------------------
if ($type === 'contact') {
    $name = trim($input['name'] ?? '');
    if ($name === '') {
        api_fail(422, 'missing name');
    }
    $handle = trim($input['telegram_handle'] ?? '') ?: null;

    // Find existing by handle or name, else create.
    $existing = null;
    if ($handle) {
        $existing = q1('SELECT * FROM contacts WHERE telegram_handle = ?', [$handle]);
    }
    if (!$existing) {
        $existing = q1('SELECT * FROM contacts WHERE name = ?', [$name]);
    }
    $id = $existing ? (int) $existing['id'] : create_contact($name, $handle);

    // Update any recognized fields that were sent.
    $updatable = array_merge(['name', 'telegram_handle', 'cadence_days'], LBB_FIELDS);
    $sets = [];
    $args = [];
    foreach ($updatable as $f) {
        if (array_key_exists($f, $input) && $input[$f] !== '') {
            $sets[] = "$f = ?";
            $args[] = trim((string) $input[$f]);
        }
    }
    if ($sets) {
        $args[] = $id;
        q('UPDATE contacts SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
    }
    echo json_encode(['ok' => true, 'contact_id' => $id]);
    exit;
}

api_fail(422, 'unknown type (use "dump" or "contact")');
