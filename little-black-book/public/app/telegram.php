<?php
/**
 * telegram.php — thin wrapper around the Telegram Bot API.
 */

require_once __DIR__ . '/config.php';

/** Call any Telegram Bot API method. Returns the decoded JSON or null. */
function tg(string $method, array $params = []): ?array
{
    $token = cfg('TELEGRAM_BOT_TOKEN', '');
    if ($token === '') {
        return null;
    }
    $url = "https://api.telegram.org/bot{$token}/{$method}";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($params),
        CURLOPT_TIMEOUT        => 15,
    ]);
    $out = curl_exec($ch);
    curl_close($ch);

    if ($out === false) {
        return null;
    }
    $decoded = json_decode($out, true);
    return is_array($decoded) ? $decoded : null;
}

/** Send a plain-text message to a chat. */
function tg_send($chatId, string $text): void
{
    tg('sendMessage', [
        'chat_id'    => $chatId,
        'text'       => $text,
        'parse_mode' => 'HTML',
    ]);
}
