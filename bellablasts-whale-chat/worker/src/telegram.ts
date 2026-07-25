import type { Env } from "./types";

export interface TelegramSendResult {
  messageId: number;
  dryRun: boolean;
}

// Notifies the owner of a substantive visitor message. When no bot token is
// configured (local dev without secrets) this logs the payload instead of
// calling the real API and returns a fake-but-unique message id, so the
// rest of the reply-threading flow is exercisable without live credentials.
export async function sendTelegramMessage(env: Env, text: string): Promise<TelegramSendResult> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_OWNER_CHAT_ID) {
    const fakeId = Date.now();
    console.log("[telegram dry-run] would send:", { chatId: env.TELEGRAM_OWNER_CHAT_ID, text, fakeId });
    return { messageId: fakeId, dryRun: true };
  }

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_OWNER_CHAT_ID, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { result: { message_id: number } };
  return { messageId: data.result.message_id, dryRun: false };
}

// Telegram echoes the `secret_token` set via `setWebhook` back on this
// header for every webhook call — the standard way to authenticate inbound
// webhooks without a signing library. Missing/mismatched secret => reject.
export function verifyWebhookSecret(request: Request, env: Env): boolean {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    // No secret configured yet (early local dev) — don't silently accept
    // everything, but don't hard-fail local testing either. Callers should
    // treat this as "unverifiable" and log accordingly.
    return false;
  }
  const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return header === env.TELEGRAM_WEBHOOK_SECRET;
}

export interface TelegramUpdate {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    reply_to_message?: { message_id: number };
  };
}

export interface OwnerReply {
  text: string;
  repliedToMessageId: number;
}

// Returns the owner's reply text + which forwarded message it's threaded to,
// or null if this update isn't a valid, in-scope owner reply (wrong chat,
// no text, or not a reply to a forwarded visitor message).
export function parseOwnerReply(update: TelegramUpdate, env: Env): OwnerReply | null {
  const message = update.message;
  if (!message || !message.text) return null;
  if (!env.TELEGRAM_OWNER_CHAT_ID) return null;
  if (String(message.chat.id) !== env.TELEGRAM_OWNER_CHAT_ID) return null;
  if (!message.reply_to_message) return null;

  return {
    text: message.text,
    repliedToMessageId: message.reply_to_message.message_id,
  };
}
