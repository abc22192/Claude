<?php
/**
 * webhook.php — the Telegram entry point.
 *
 * Telegram POSTs every message here. We verify the secret header, read the
 * message text, run the brain-dump loop, and reply. Always answers 200 fast
 * so Telegram never retries and never marks the webhook unhealthy.
 */

require_once __DIR__ . '/app/sorter.php';

// Respond 200 immediately in spirit — do the work, then output OK.
header('Content-Type: text/plain');

// 1) Verify the secret so randoms can't POST fake updates.
$expected = cfg('TELEGRAM_WEBHOOK_SECRET', '');
$got = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
if ($expected !== '' && !hash_equals($expected, $got)) {
    http_response_code(403);
    exit('forbidden');
}

// 2) Read the update.
$raw = file_get_contents('php://input');
$update = json_decode($raw, true);
if (!is_array($update)) {
    exit('ok'); // nothing to do
}

$message = $update['message'] ?? $update['edited_message'] ?? null;
if (!$message) {
    exit('ok'); // ignore non-message updates
}

$chatId = (string) ($message['chat']['id'] ?? '');
$fromId = (string) ($message['from']['id'] ?? '');
$text   = trim($message['text'] ?? '');

// 3) Optional owner lock: only listen to Bella.
$owner = cfg('TELEGRAM_OWNER_ID', null);
if ($owner && (string) $owner !== $fromId) {
    exit('ok');
}

if ($text === '') {
    tg_send($chatId, "Send me a brain dump as text and I'll sort it into the Little Black Book.");
    exit('ok');
}

// 4) Commands.
if ($text === '/start' || $text === '/help') {
    tg_send($chatId,
        "📓 <b>Little Black Book</b>\n\n"
        . "Just dump messy notes about a person and I'll sort them.\n\n"
        . "• <code>name: Their Name</code> — set who the next notes are about\n"
        . "• <code>/people</code> — list everyone\n"
        . "• <code>/review</code> — see anything I wasn't sure about\n\n"
        . "Nothing is ever lost — I always save the raw note first."
    );
    exit('ok');
}

if ($text === '/people') {
    $rows = qa('SELECT name, telegram_handle, next_followup FROM contacts ORDER BY updated_at DESC LIMIT 30');
    if (!$rows) {
        tg_send($chatId, "No people yet. Send a brain dump to start.");
        exit('ok');
    }
    $lines = array_map(function ($r) {
        $h = $r['telegram_handle'] ? " ({$r['telegram_handle']})" : '';
        $f = $r['next_followup'] ? " — next: {$r['next_followup']}" : '';
        return "• " . htmlspecialchars($r['name'] . $h . $f);
    }, $rows);
    tg_send($chatId, "<b>People</b>\n" . implode("\n", $lines));
    exit('ok');
}

if ($text === '/review') {
    $rows = qa(
        'SELECT rq.id, rc.raw_text FROM review_queue rq
         JOIN raw_captures rc ON rc.id = rq.raw_capture_id
         WHERE rq.resolved = 0 ORDER BY rq.created_at DESC LIMIT 10'
    );
    if (!$rows) {
        tg_send($chatId, "Nothing waiting for review. 🎉");
        exit('ok');
    }
    $lines = array_map(fn($r) => "• " . htmlspecialchars(mb_substr($r['raw_text'], 0, 80)), $rows);
    tg_send($chatId, "<b>Needs a person</b>\n" . implode("\n", $lines)
        . "\n\nReply to the last one with <code>name: Their Name</code>.");
    exit('ok');
}

// 5) Everything else is a brain dump.
$reply = handle_dump($text, $chatId);
tg_send($chatId, $reply);
exit('ok');
