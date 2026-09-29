<?php
/**
 * sorter.php — the brain-dump loop.
 *
 * Spec rule that drives every decision here:
 *   brain dump FIRST, sorting SECOND.
 *   Save the raw message intact, THEN try to route it. Never lose the original,
 *   never silently rewrite it, and only ask for information that actually
 *   matters (a person with no name is not usable; a missing "dream night" is).
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/telegram.php';

/** Fields the AI/rule extractor may fill on a contact. */
const LBB_FIELDS = [
    'call_me', 'tone', 'magic_words', 'likes_about_me', 'dream_night',
    'fetishes', 'plans_to_finish', 'product_awareness', 'platform',
    'payment_info', 'spending', 'status', 'notes',
];

/** 1) Save the raw dump exactly as received. This happens no matter what. */
function capture_raw(string $text, ?string $chatId, string $source = 'telegram'): int
{
    return insert(
        'INSERT INTO raw_captures (source, source_chat, raw_text) VALUES (?, ?, ?)',
        [$source, $chatId, $text]
    );
}

/** Look for an existing contact referenced anywhere in the text. */
function match_contact(string $text): array
{
    $hits = [];

    // Strong signal: an @handle.
    if (preg_match_all('/@([A-Za-z0-9_]{3,})/', $text, $m)) {
        foreach ($m[1] as $handle) {
            $row = q1('SELECT * FROM contacts WHERE telegram_handle = ?', ['@' . $handle])
                ?? q1('SELECT * FROM contacts WHERE telegram_handle = ?', [$handle]);
            if ($row) {
                $hits[$row['id']] = $row;
            }
        }
    }

    // Weaker signal: a known contact name appearing as a whole word.
    if (!$hits) {
        foreach (qa('SELECT * FROM contacts') as $c) {
            $name = trim($c['name']);
            if ($name !== '' && preg_match('/\b' . preg_quote($name, '/') . '\b/i', $text)) {
                $hits[$c['id']] = $c;
            }
        }
    }

    return array_values($hits);
}

/** Rule-based field extraction. Cheap, free, runs always. */
function extract_fields_rules(string $text): array
{
    $out = [];
    $patterns = [
        'call_me'         => '/call(?:s)?\s+me[:\s]+([^\n.]+)/i',
        'tone'            => '/tone[:\s]+([^\n.]+)/i',
        'magic_words'     => '/magic\s*words?[:\s]+([^\n.]+)/i',
        'likes_about_me'  => '/likes?\s+about\s+me[:\s]+([^\n.]+)/i',
        'dream_night'     => '/dream\s*night[:\s]+([^\n.]+)/i',
        'fetishes'        => '/(?:fetish(?:es)?|into|kink[s]?)[:\s]+([^\n.]+)/i',
        'plans_to_finish' => '/plan(?:s)?(?:\s+to\s+finish)?[:\s]+([^\n.]+)/i',
        'product_awareness' => '/(?:knows\s+about|aware\s+of|owns)[:\s]+([^\n.]+)/i',
        'platform'        => '/platform[:\s]+([^\n.]+)/i',
        'spending'        => '/(?:spent|spends|spending)[:\s]+([^\n.]+)/i',
        'status'          => '/status[:\s]+([^\n.]+)/i',
    ];
    foreach ($patterns as $field => $re) {
        if (preg_match($re, $text, $m)) {
            $out[$field] = trim($m[1]);
        }
    }
    return $out;
}

/**
 * Optional AI extraction. Only runs if an Anthropic key is configured.
 * Falls back silently to rules on any error, so the bot never breaks.
 */
function extract_fields_ai(string $text): array
{
    $key = cfg('ANTHROPIC_API_KEY', '');
    if ($key === '') {
        return [];
    }

    $fields = implode(', ', LBB_FIELDS);
    $prompt = "You extract CRM fields from a messy note about ONE person. "
        . "Return ONLY a JSON object using these keys where present: {$fields}. "
        . "Omit keys you cannot fill. No commentary.\n\nNOTE:\n" . $text;

    $body = json_encode([
        'model'      => cfg('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
        'max_tokens' => 500,
        'messages'   => [['role' => 'user', 'content' => $prompt]],
    ]);

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'content-type: application/json',
            'x-api-key: ' . $key,
            'anthropic-version: 2023-06-01',
        ],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_TIMEOUT    => 30,
    ]);
    $out = curl_exec($ch);
    curl_close($ch);
    if ($out === false) {
        return [];
    }

    $decoded = json_decode($out, true);
    $textOut = $decoded['content'][0]['text'] ?? '';
    if (preg_match('/\{.*\}/s', $textOut, $m)) {
        $json = json_decode($m[0], true);
        if (is_array($json)) {
            // keep only known fields
            return array_intersect_key($json, array_flip(LBB_FIELDS));
        }
    }
    return [];
}

/** Merge AI + rule extraction (AI wins where both present). */
function extract_fields(string $text): array
{
    return array_merge(extract_fields_rules($text), extract_fields_ai($text));
}

/** Create a bare contact and return its id. */
function create_contact(string $name, ?string $handle = null): int
{
    return insert(
        'INSERT INTO contacts (name, telegram_handle, status) VALUES (?, ?, ?)',
        [$name, $handle, 'new']
    );
}

/** Apply a dump to a contact: log the message, fill fields, set follow-up. */
function apply_dump(int $contactId, int $rawId, string $text): void
{
    // 1) Log the interaction (raw text preserved on the message too).
    insert(
        'INSERT INTO messages (contact_id, raw_capture_id, direction, body) VALUES (?, ?, ?, ?)',
        [$contactId, $rawId, 'note', $text]
    );

    // 2) Fill only EMPTY fields. Never overwrite something you already know
    //    from a fresh dump — new facts get appended to notes instead.
    $contact = q1('SELECT * FROM contacts WHERE id = ?', [$contactId]);
    $fields  = extract_fields($text);
    $sets = [];
    $args = [];
    foreach ($fields as $field => $val) {
        if (!in_array($field, LBB_FIELDS, true)) {
            continue;
        }
        if (empty($contact[$field])) {
            $sets[] = "$field = ?";
            $args[] = $val;
        }
    }

    // 3) Cadence-based follow-up + last contact.
    $cadence = (int) ($contact['cadence_days'] ?: 7);
    $next    = date('Y-m-d', strtotime("+{$cadence} days"));
    $sets[]  = 'last_contact = NOW()';
    $sets[]  = 'next_followup = ?';
    $args[]  = $next;
    $sets[]  = "status = CASE WHEN status='new' THEN 'active' ELSE status END";

    $args[] = $contactId;
    q('UPDATE contacts SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);

    // 4) Record the follow-up row so the dashboard can surface it.
    insert(
        'INSERT INTO follow_ups (contact_id, due_at, note) VALUES (?, ?, ?)',
        [$contactId, $next, 'Auto follow-up from brain dump']
    );

    // 5) Mark the raw capture sorted.
    q('UPDATE raw_captures SET contact_id = ?, review_status = ? WHERE id = ?',
        [$contactId, 'sorted', $rawId]);
}

/**
 * Ask ONE missing-info question if a materially useful field is still empty.
 * Order = most valuable relationship intel first. Returns '' if nothing to ask.
 */
function missing_info_question(int $contactId): string
{
    $c = q1('SELECT * FROM contacts WHERE id = ?', [$contactId]);
    $askable = [
        'dream_night'    => 'What is their Dream Night?',
        'magic_words'    => 'Any Magic Words that work on them?',
        'likes_about_me' => 'What do they like about you?',
        'tone'           => 'What tone do they want from you?',
        'call_me'        => 'What do they call you?',
    ];
    foreach ($askable as $field => $question) {
        if (empty($c[$field])) {
            return $question;
        }
    }
    return '';
}

/** Get or create the per-chat context row. */
function chat_ctx(string $chatId): array
{
    $row = q1('SELECT * FROM chat_context WHERE chat_id = ?', [$chatId]);
    if (!$row) {
        q('INSERT INTO chat_context (chat_id) VALUES (?)', [$chatId]);
        $row = q1('SELECT * FROM chat_context WHERE chat_id = ?', [$chatId]);
    }
    return $row;
}

function set_chat_ctx(string $chatId, array $fields): void
{
    $sets = [];
    $args = [];
    foreach ($fields as $k => $v) {
        $sets[] = "$k = ?";
        $args[] = $v;
    }
    $args[] = $chatId;
    q('UPDATE chat_context SET ' . implode(', ', $sets) . ' WHERE chat_id = ?', $args);
}

/**
 * Main entry: take one Telegram text message and do the whole loop.
 * Returns the reply text to send back to Bella.
 */
function handle_dump(string $text, string $chatId): string
{
    $text = trim($text);
    $ctx  = chat_ctx($chatId);

    // --- Command: explicitly set the active person -------------------------
    if (preg_match('/^name\s*[:=]\s*(.+)$/i', $text, $m)) {
        $name   = trim($m[1]);
        $handle = null;
        if (preg_match('/@([A-Za-z0-9_]{3,})/', $name, $hm)) {
            $handle = '@' . $hm[1];
        }
        $existing = match_contact($name);
        $id = $existing ? $existing[0]['id'] : create_contact($name, $handle);
        set_chat_ctx($chatId, ['contact_id' => $id, 'awaiting' => null, 'pending_raw' => null]);
        return "Got it. Now logging notes for <b>" . htmlspecialchars($name) . "</b>. "
            . "Send the brain dump and I'll sort it.";
    }

    // --- We previously asked "who is this about?" --------------------------
    if (($ctx['awaiting'] ?? null) === 'who' && $text !== '') {
        $pendingRaw = (int) $ctx['pending_raw'];
        $match = match_contact($text);
        if ($match) {
            $id = $match[0]['id'];
        } else {
            // Treat their reply as the new person's name.
            $handle = null;
            if (preg_match('/@([A-Za-z0-9_]{3,})/', $text, $hm)) {
                $handle = '@' . $hm[1];
            }
            $id = create_contact(trim($text), $handle);
        }
        $raw = q1('SELECT raw_text FROM raw_captures WHERE id = ?', [$pendingRaw]);
        if ($raw) {
            apply_dump($id, $pendingRaw, $raw['raw_text']);
            q('UPDATE review_queue SET resolved = 1 WHERE raw_capture_id = ?', [$pendingRaw]);
        }
        set_chat_ctx($chatId, ['contact_id' => $id, 'awaiting' => null, 'pending_raw' => null]);
        $c = q1('SELECT name FROM contacts WHERE id = ?', [$id]);
        $q = missing_info_question($id);
        $reply = "Filed under <b>" . htmlspecialchars($c['name']) . "</b>. ✅";
        return $q ? "$reply\n\nOne thing to make this useful: $q" : $reply;
    }

    // --- Normal brain dump -------------------------------------------------
    // 1) Save raw FIRST, always.
    $rawId = capture_raw($text, $chatId);

    // 2) Who is this about?
    $matches = match_contact($text);

    if (count($matches) === 1) {
        $id = $matches[0]['id'];
    } elseif (($ctx['contact_id'] ?? null) && count($matches) === 0) {
        // No name in the dump, but we have an active person in this chat.
        $id = (int) $ctx['contact_id'];
    } else {
        // Ambiguous (0 matches and no active person, or 2+ matches) -> review.
        insert('INSERT INTO review_queue (raw_capture_id, reason) VALUES (?, ?)',
            [$rawId, count($matches) > 1 ? 'Multiple people matched' : 'No person matched']);
        q('UPDATE raw_captures SET review_status = ? WHERE id = ?', ['review', $rawId]);
        set_chat_ctx($chatId, ['awaiting' => 'who', 'pending_raw' => $rawId]);
        return "Saved that (nothing lost). <b>Who is this about?</b> "
            . "Reply with a name or @handle, or send <code>name: Their Name</code>.";
    }

    apply_dump($id, $rawId, $text);
    set_chat_ctx($chatId, ['contact_id' => $id, 'awaiting' => null, 'pending_raw' => null]);

    $c = q1('SELECT name, next_followup FROM contacts WHERE id = ?', [$id]);
    $reply = "Sorted into <b>" . htmlspecialchars($c['name']) . "</b>. ✅ "
        . "Next follow-up: " . htmlspecialchars($c['next_followup']);
    $qn = missing_info_question($id);
    return $qn ? "$reply\n\nTo make it useful: $qn" : $reply;
}
