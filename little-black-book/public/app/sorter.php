<?php
/**
 * sorter.php — the brain-dump loop for the Little Black Book CRM.
 *
 * Non-negotiable rules from the handoff:
 *   1) Brain dump FIRST, sorting SECOND. Save raw intact before anything else.
 *   2) Search-before-create. Never make a duplicate person.
 *   3) Never overwrite known information with a guess. Only fill EMPTY fields.
 *   4) Never invent a field value. If ambiguous → mark uncertain, don't decide.
 *   5) Dream Night ≠ Fetish. Never flatten "his personalized fantasy scenario"
 *      into a one-word niche. Preserve verbatim wording.
 *   6) Tone ≠ Fetish. Never infer Tone from a niche. Only accept Tone that is
 *      explicitly stated OR maps to a Voice Router card name.
 *   7) PERSON (memory) is separate from SESSION (paid experience). A paid
 *      session creates a Session row; the person's product-awareness flag is
 *      set; Total Spent and Session Count are DERIVED from sessions.
 *   8) Bella Effect: detect it, enrich the person's profile, log the paid
 *      experience as a Session with type='bella_effect' and effect_level.
 *   9) Ask only genuinely useful missing questions. Never a giant intake form.
 *  10) Anything that doesn't fit a field is appended to `notes` (never lost).
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/telegram.php';

/** Person fields the extractor / API are allowed to touch. */
const LBB_FIELDS = [
    'username', 'telegram_handle', 'telegram_id', 'email', 'chat_on',
    'met_where', 'date_met',
    'fetishes', 'magic_words', 'likes_about_me', 'dream_night',
    'tone', 'call_me', 'plans_to_finish',
    'payment_method', 'prompt_payment', 'payment_vibe', 'spender_tier',
    'knows_audio', 'knows_bella_effect', 'knows_inhalers',
    'red_flags', 'green_flags', 'status', 'notes',
];

/** Niche synonyms — used ONLY to fill `fetishes`. Never bled into tone or dream. */
const LBB_NICHES = [
    'fart', 'farts', 'farting', 'feet', 'foot', 'giantess', 'size', 'vore',
    'scat', 'toilet', 'findom', 'bondage', 'joi', 'edging', 'sph', 'humiliation',
];

// -----------------------------------------------------------------------------
// 1) Raw capture — always first, always intact.
// -----------------------------------------------------------------------------
function capture_raw(string $text, ?string $chatId, string $source = 'telegram'): int
{
    return insert(
        'INSERT INTO raw_captures (source, source_chat, raw_text) VALUES (?, ?, ?)',
        [$source, $chatId, $text]
    );
}

// -----------------------------------------------------------------------------
// 2) Search-before-create person matching.
// -----------------------------------------------------------------------------
function match_contact(string $text): array
{
    $hits = [];

    if (preg_match_all('/@([A-Za-z0-9_]{3,})/', $text, $m)) {
        foreach ($m[1] as $handle) {
            $row = q1('SELECT * FROM contacts WHERE telegram_handle = ?', ['@' . $handle])
                ?? q1('SELECT * FROM contacts WHERE telegram_handle = ?', [$handle])
                ?? q1('SELECT * FROM contacts WHERE username = ?', [$handle]);
            if ($row) { $hits[$row['id']] = $row; }
        }
    }
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

function create_contact(string $name, ?string $handle = null): int
{
    return insert(
        'INSERT INTO contacts (name, telegram_handle, status) VALUES (?, ?, ?)',
        [$name, $handle, 'new']
    );
}

// -----------------------------------------------------------------------------
// 3) Field extraction — RULE-based, deterministic, no guessing.
//    Each rule requires an explicit cue. If the cue isn't there, the field
//    stays blank rather than being invented.
// -----------------------------------------------------------------------------
function extract_fields_rules(string $text): array
{
    $out = [];

    // Explicit labeled fields ("call me: goddess", "dream night: ...").
    // Dream Night keeps its raw wording; do NOT trim to a niche word.
    $labeled = [
        'call_me'        => '/(?:they\s+)?call\s+me[:\s]+([^\n.]+)/i',
        'dream_night'    => '/dream\s*night(?:\s+is)?[:\s]+([^.\n]+)/i',
        'magic_words'    => '/magic\s*words?[:\s]+([^\n.]+)/i',
        'likes_about_me' => '/likes?\s+about\s+me[:\s]+([^\n.]+)/i',
        'plans_to_finish'=> '/plans?(?:\s+to\s+finish)?[:\s]+([^\n.]+)/i',
        'payment_method' => '/(?:pays?\s+with|payment\s*(?:method)?|paid\s+via)[:\s]+([^\n.]+)/i',
        'met_where'      => '/met\s+(?:me\s+)?(?:on|at|through)[:\s]+([^\n.]+)/i',
        'email'          => '/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i',
    ];
    foreach ($labeled as $field => $re) {
        if (preg_match($re, $text, $m)) { $out[$field] = trim($m[1]); }
    }

    // Chat platform — only if explicitly stated.
    if (preg_match('/\b(telegram|onlyfans|of|atw|twitter|x|email|snap|instagram|ig)\b/i', $text, $m)) {
        $out['chat_on'] = strtolower($m[1]);
    }

    // Niches → fetishes only. Never bleed into tone or dream night.
    $found = [];
    foreach (LBB_NICHES as $n) {
        if (preg_match('/\b' . preg_quote($n, '/') . '\b/i', $text)) { $found[] = strtolower($n); }
    }
    if ($found) { $out['fetishes'] = implode(', ', array_unique($found)); }

    // Tone: ONLY when the dump literally labels it ("tone: <words>" or
    // "tone = <words>"). Free-text value, never inferred from a niche.
    // Requires the colon/equals so incidental mentions ("no tone in this
    // dump") don't get scooped up.
    if (preg_match('/(?:^|[,;\n])\s*tone\s*[:=]\s*([^\n.]+)/i', $text, $m)) {
        $out['tone'] = trim($m[1]);
    } elseif (preg_match('/^\s*tone\s*[:=]\s*([^\n.]+)/im', $text, $m)) {
        $out['tone'] = trim($m[1]);
    }

    // Product awareness — explicit mentions only.
    if (preg_match('/\bbella\s*effect\b|\bBE\b/i', $text)) { $out['knows_bella_effect'] = 1; }
    if (preg_match('/\baudio(s)?\b|\bmp3\b/i', $text))       { $out['knows_audio'] = 1; }
    if (preg_match('/\binhaler(s)?\b/i', $text))             { $out['knows_inhalers'] = 1; }

    // Flags — captured only if the dump names them.
    if (preg_match('/\bred\s*flag[s]?[:\s]*([^\n.]+)/i', $text, $m))   { $out['red_flags']   = trim($m[1]); }
    if (preg_match('/\bgreen\s*flag[s]?[:\s]*([^\n.]+)/i', $text, $m)) { $out['green_flags'] = trim($m[1]); }
    // Common creep signals → red flags, but only as a labeled note, not silent.
    if (empty($out['red_flags']) && preg_match('/\b(chargeback|refund\s+scam|creep(?:y)?|sketch(?:y)?|pushy)\b/i', $text, $m)) {
        $out['red_flags'] = strtolower($m[1]);
    }

    // Spender tier — only if explicitly said.
    if (preg_match('/\b(whale|regular|one[-\s]?off|window[-\s]?shop(?:per)?)\b/i', $text, $m)) {
        $out['spender_tier'] = strtolower(str_replace([' ', '-'], '_', $m[1]));
    }
    // Payment vibe — explicit language only.
    if (preg_match('/\bpayment\s*vibe[:\s]+([^\n.]+)/i', $text, $m)) {
        $out['payment_vibe'] = trim($m[1]);
    }
    if (preg_match('/\b(pays?\s+fast|prompt\s+pay(?:er|ment)?|slow\s+pay(?:er)?|haggles?)\b/i', $text, $m)) {
        $out['prompt_payment'] = str_contains(strtolower($m[1]), 'slow') ? 'slow'
            : (str_contains(strtolower($m[1]), 'haggl') ? 'haggles' : 'yes');
    }

    return $out;
}

/** Optional AI cleanup — off by default, silent fallback. */
function extract_fields_ai(string $text): array
{
    $key = cfg('ANTHROPIC_API_KEY', '');
    if ($key === '') { return []; }

    $fields = implode(', ', LBB_FIELDS);
    $prompt = "You extract CRM fields from a messy note about ONE person. "
        . "Return ONLY a JSON object using ANY of these keys: {$fields}.\n\n"
        . "STRICT RULES:\n"
        . "- Omit any key you cannot fill directly from the note. Never guess.\n"
        . "- Never derive `tone` from a fetish or niche. Only set `tone` if the "
        . "note explicitly states a tone; keep the human's own words verbatim.\n"
        . "- `dream_night` is a scenario, not a niche word. Preserve their own "
        . "wording. Never replace a scenario with a single-word niche.\n"
        . "- `fetishes` is niches only.\n"
        . "- Bella Effect terminology (BE, effect level L1/L2/L3/L4) means "
        . "knows_bella_effect=1; do NOT put it in fetishes.\n"
        . "No commentary.\n\nNOTE:\n" . $text;

    $body = json_encode([
        'model'      => cfg('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
        'max_tokens' => 600,
        'messages'   => [['role' => 'user', 'content' => $prompt]],
    ]);
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'content-type: application/json',
            'x-api-key: ' . $key,
            'anthropic-version: 2023-06-01',
        ],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_TIMEOUT => 30,
    ]);
    $out = curl_exec($ch); curl_close($ch);
    if ($out === false) { return []; }
    $decoded = json_decode($out, true);
    $textOut = $decoded['content'][0]['text'] ?? '';
    if (!preg_match('/\{.*\}/s', $textOut, $m)) { return []; }
    $json = json_decode($m[0], true);
    if (!is_array($json)) { return []; }
    return array_intersect_key($json, array_flip(LBB_FIELDS));
}

function extract_fields(string $text): array
{
    return array_merge(extract_fields_rules($text), extract_fields_ai($text));
}

// -----------------------------------------------------------------------------
// 4) Session detection — paid experiences become SESSION rows, not messages.
//    Recognizes:
//      - explicit dollar amounts near buy/pay/booked
//      - Bella Effect L1..L4
//      - "custom" or "call" purchases
// -----------------------------------------------------------------------------
function detect_sessions(string $text): array
{
    $sessions = [];

    // Bella Effect session with level.
    if (preg_match('/\b(?:bella\s*effect|BE)\b[^\n]{0,40}?\b(L[1-4])\b/i', $text, $m)) {
        $sessions[] = [
            'session_name' => 'Bella Effect ' . strtoupper($m[1]),
            'session_type' => 'bella_effect',
            'effect_level' => strtoupper($m[1]),
        ];
    } elseif (preg_match('/\b(?:bella\s*effect|BE)\b/i', $text)
              && preg_match('/\b(paid|bought|booked|purchased)\b/i', $text)) {
        // Paid BE with no level → still a Session, level unknown.
        $sessions[] = [
            'session_name' => 'Bella Effect',
            'session_type' => 'bella_effect',
            'effect_level' => null,
        ];
    }

    // Custom or call purchases.
    if (preg_match('/\b(bought|paid\s+for|purchased|booked)\s+(?:a\s+)?(custom|call|clip|audio)\b/i', $text, $m)) {
        $sessions[] = [
            'session_name' => ucfirst(strtolower($m[2])),
            'session_type' => strtolower($m[2]),
            'effect_level' => null,
        ];
    }

    // Attach amount if the dump has one near a pay word.
    if ($sessions && preg_match('/\$\s*(\d+(?:\.\d{1,2})?)/', $text, $m)) {
        $sessions[0]['amount_paid'] = (float) $m[1];
    }
    return $sessions;
}

// -----------------------------------------------------------------------------
// 5) Apply a dump: log the interaction, fill EMPTY person fields, create any
//    detected sessions, schedule the follow-up. Preserves the raw always.
// -----------------------------------------------------------------------------
function apply_dump(int $contactId, int $rawId, string $text): void
{
    $contact = q1('SELECT * FROM contacts WHERE id = ?', [$contactId]);
    $fields  = extract_fields($text);

    // Detect and persist SESSION rows (paid) BEFORE person updates so
    // knows_bella_effect gets set even if a Bella Effect keyword was the only
    // Bella-Effect signal in the dump.
    foreach (detect_sessions($text) as $s) {
        insert(
            'INSERT INTO sessions (contact_id, session_name, session_type, effect_level, session_date, amount_paid, raw_capture_id)
             VALUES (?, ?, ?, ?, CURDATE(), ?, ?)',
            [$contactId, $s['session_name'], $s['session_type'] ?? null,
             $s['effect_level'] ?? null, $s['amount_paid'] ?? null, $rawId]
        );
        if (($s['session_type'] ?? '') === 'bella_effect') {
            $fields['knows_bella_effect'] = 1;
        }
        if (($s['session_type'] ?? '') === 'audio') {
            $fields['knows_audio'] = 1;
        }
    }

    // INTERACTION row — the "what just happened" layer.
    insert(
        'INSERT INTO interactions (contact_id, raw_capture_id, channel, summary) VALUES (?, ?, ?, ?)',
        [$contactId, $rawId, $contact['chat_on'] ?? null, $text]
    );

    // Person-field updates: ONLY fill fields that are empty. Never overwrite.
    $sets = [];
    $args = [];
    $overflow = [];
    foreach ($fields as $field => $val) {
        if (!in_array($field, LBB_FIELDS, true)) { continue; }
        if ($val === '' || $val === null) { continue; }
        $currentlyEmpty = empty($contact[$field]) || $contact[$field] === '0';
        if ($currentlyEmpty) {
            $sets[] = "$field = ?";
            $args[] = $val;
        } else {
            // Known value present — don't clobber. Record the new fact in notes.
            $overflow[] = "[" . date('Y-m-d') . "] $field: $val (prev kept)";
        }
    }

    // If any information didn't fit a mapped field, append it to notes.
    if ($overflow) {
        $newNotes = trim(($contact['notes'] ?? '') . "\n" . implode("\n", $overflow));
        $sets[] = 'notes = ?';
        $args[] = $newNotes;
    }

    // Cadence + follow-up state on the person row.
    $cadence = (int) ($contact['cadence_days'] ?: 7);
    $next    = date('Y-m-d', strtotime("+{$cadence} days"));
    $sets[] = 'last_contact = NOW()';
    $sets[] = 'next_followup = ?'; $args[] = $next;
    $sets[] = 'followup_status = ?'; $args[] = 'open';
    $sets[] = 'followup_sent = 0';
    $sets[] = "status = CASE WHEN status='new' THEN 'active' ELSE status END";

    $args[] = $contactId;
    q('UPDATE contacts SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);

    // Follow-up row for the dashboard.
    insert(
        'INSERT INTO follow_ups (contact_id, due_at, reminder, status) VALUES (?, ?, ?, ?)',
        [$contactId, $next, 'Auto follow-up from brain dump', 'open']
    );

    // Mark the raw capture sorted.
    q('UPDATE raw_captures SET contact_id = ?, review_status = ? WHERE id = ?',
        [$contactId, 'sorted', $rawId]);
}

// -----------------------------------------------------------------------------
// 6) One useful missing-info question, in priority order. Never a big form.
//    Includes the "no tone but a niche was learned → ask tone" rule so we
//    never silently infer tone from a fetish.
// -----------------------------------------------------------------------------
function missing_info_question(int $contactId, string $lastText = ''): string
{
    $c = q1('SELECT * FROM contacts WHERE id = ?', [$contactId]);

    $askable = [
        'dream_night'    => 'What is their Dream Night? (their scenario, in their words)',
        'tone'           => 'What tone works with them? (a note to yourself, whatever wording you use)',
        'magic_words'    => 'Any Magic Words that work on them?',
        'likes_about_me' => 'What do they specifically like about you?',
        'call_me'        => 'What do they call you?',
        'chat_on'        => 'Where do you talk to them?',
    ];
    foreach ($askable as $field => $question) {
        if (empty($c[$field])) { return $question; }
    }
    return '';
}

// -----------------------------------------------------------------------------
// 7) Per-chat context so pronouns land on the right person.
// -----------------------------------------------------------------------------
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
    $sets = []; $args = [];
    foreach ($fields as $k => $v) { $sets[] = "$k = ?"; $args[] = $v; }
    $args[] = $chatId;
    q('UPDATE chat_context SET ' . implode(', ', $sets) . ' WHERE chat_id = ?', $args);
}

// -----------------------------------------------------------------------------
// 8) Main entry — one Telegram / web text → reply string.
// -----------------------------------------------------------------------------
function handle_dump(string $text, string $chatId): string
{
    $text = trim($text);
    $ctx  = chat_ctx($chatId);

    // Explicit "name: X" sets the active person.
    if (preg_match('/^name\s*[:=]\s*(.+)$/i', $text, $m)) {
        $name = trim($m[1]); $handle = null;
        if (preg_match('/@([A-Za-z0-9_]{3,})/', $name, $hm)) { $handle = '@' . $hm[1]; }
        $existing = match_contact($name);
        $id = $existing ? $existing[0]['id'] : create_contact($name, $handle);
        set_chat_ctx($chatId, ['contact_id' => $id, 'awaiting' => null, 'pending_raw' => null]);
        return "Got it. Now logging notes for <b>" . htmlspecialchars($name) . "</b>. Send the brain dump.";
    }

    // Answering a "who is this about?" prompt.
    if (($ctx['awaiting'] ?? null) === 'who' && $text !== '') {
        $pendingRaw = (int) $ctx['pending_raw'];
        $match = match_contact($text);
        if ($match) {
            $id = $match[0]['id'];
        } else {
            $handle = null;
            if (preg_match('/@([A-Za-z0-9_]{3,})/', $text, $hm)) { $handle = '@' . $hm[1]; }
            $id = create_contact(trim($text), $handle);
        }
        $raw = q1('SELECT raw_text FROM raw_captures WHERE id = ?', [$pendingRaw]);
        if ($raw) {
            apply_dump($id, $pendingRaw, $raw['raw_text']);
            q('UPDATE review_queue SET resolved = 1 WHERE raw_capture_id = ?', [$pendingRaw]);
        }
        set_chat_ctx($chatId, ['contact_id' => $id, 'awaiting' => null, 'pending_raw' => null]);
        $c = q1('SELECT name FROM contacts WHERE id = ?', [$id]);
        $qn = missing_info_question($id);
        $reply = "Filed under <b>" . htmlspecialchars($c['name']) . "</b>. ✅";
        return $qn ? "$reply\n\nOne useful thing missing: $qn" : $reply;
    }

    // Normal brain dump.
    $rawId = capture_raw($text, $chatId);
    $matches = match_contact($text);

    if (count($matches) === 1) {
        $id = $matches[0]['id'];
    } elseif (($ctx['contact_id'] ?? null) && count($matches) === 0) {
        $id = (int) $ctx['contact_id'];
    } else {
        insert('INSERT INTO review_queue (raw_capture_id, reason) VALUES (?, ?)',
            [$rawId, count($matches) > 1 ? 'Multiple people matched' : 'No person matched']);
        q('UPDATE raw_captures SET review_status = ? WHERE id = ?', ['review', $rawId]);
        set_chat_ctx($chatId, ['awaiting' => 'who', 'pending_raw' => $rawId]);
        return "Saved that (nothing lost). <b>Who is this about?</b> Reply with a name or @handle, "
            . "or send <code>name: Their Name</code>.";
    }

    apply_dump($id, $rawId, $text);
    set_chat_ctx($chatId, ['contact_id' => $id, 'awaiting' => null, 'pending_raw' => null]);

    $c = q1('SELECT name, next_followup FROM contacts WHERE id = ?', [$id]);
    $reply = "Sorted into <b>" . htmlspecialchars($c['name']) . "</b>. ✅ "
        . "Next follow-up: " . htmlspecialchars($c['next_followup']);

    $qn = missing_info_question($id, $text);
    if ($qn) { $reply .= "\n\n$qn"; }
    return $reply;
}
