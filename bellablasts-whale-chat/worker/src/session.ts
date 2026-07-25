import type { ChatMessage, Env, MessageFrom, SessionRecord } from "./types";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const PENDING_TTL_SECONDS = 24 * 60 * 60; // 1 day safety net beyond the reply deadline
const TG_INDEX_TTL_SECONDS = 7 * 24 * 60 * 60; // matches session TTL

const sessionKey = (id: string) => `session:${id}`;
const pendingKey = (id: string) => `pending:${id}`;
const tgIndexKey = (telegramMessageId: number) => `tg:${telegramMessageId}`;

export async function getSession(env: Env, id: string): Promise<SessionRecord | null> {
  const raw = await env.CHAT_KV.get(sessionKey(id));
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export function newSession(id: string): SessionRecord {
  return {
    id,
    createdAt: Date.now(),
    messages: [],
    lastSeq: 0,
    awaitingReply: false,
    deadlineAt: null,
    fallbackSent: false,
    telegramMessageId: null,
  };
}

export async function putSession(env: Env, session: SessionRecord): Promise<void> {
  await env.CHAT_KV.put(sessionKey(session.id), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export function appendMessage(
  session: SessionRecord,
  from: MessageFrom,
  text: string,
  kind?: ChatMessage["kind"]
): ChatMessage {
  const seq = session.lastSeq + 1;
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    from,
    text,
    seq,
    ts: Date.now(),
    ...(kind ? { kind } : {}),
  };
  session.messages.push(message);
  session.lastSeq = seq;
  return message;
}

export async function setPending(env: Env, id: string, deadlineAt: number): Promise<void> {
  await env.CHAT_KV.put(pendingKey(id), JSON.stringify({ deadlineAt }), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

export async function clearPending(env: Env, id: string): Promise<void> {
  await env.CHAT_KV.delete(pendingKey(id));
}

export async function setTelegramIndex(
  env: Env,
  telegramMessageId: number,
  sessionId: string
): Promise<void> {
  await env.CHAT_KV.put(tgIndexKey(telegramMessageId), sessionId, {
    expirationTtl: TG_INDEX_TTL_SECONDS,
  });
}

export async function getSessionIdForTelegramMessage(
  env: Env,
  telegramMessageId: number
): Promise<string | null> {
  return env.CHAT_KV.get(tgIndexKey(telegramMessageId));
}

export interface PendingEntry {
  sessionId: string;
  deadlineAt: number;
}

// Scans only open threads (the `pending:` prefix), not every session ever
// created — keeps the cron cheap and bounded to genuinely awaiting chats.
export async function listPendingEntries(env: Env): Promise<PendingEntry[]> {
  const entries: PendingEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.CHAT_KV.list({ prefix: "pending:", cursor });
    for (const key of page.keys) {
      const sessionId = key.name.slice("pending:".length);
      const raw = await env.CHAT_KV.get(key.name);
      if (!raw) continue;
      const { deadlineAt } = JSON.parse(raw) as { deadlineAt: number };
      entries.push({ sessionId, deadlineAt });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return entries;
}
