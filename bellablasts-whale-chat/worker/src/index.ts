import type { Env } from "./types";
import { classifyMessage } from "./classify";
import { corsHeaders, handleOptions, jsonResponse } from "./cors";
import {
  appendMessage,
  clearPending,
  getSession,
  getSessionIdForTelegramMessage,
  listPendingEntries,
  newSession,
  putSession,
  setPending,
  setTelegramIndex,
} from "./session";
import { parseOwnerReply, sendTelegramMessage, verifyWebhookSecret } from "./telegram";
import type { TelegramUpdate } from "./telegram";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES_PER_SESSION = 200;

const GREETING_REPLY = "Hey! Thanks for stopping by. What's on your mind?";

const FALLBACK_TEXT =
  "Still here — thanks for waiting. I'm not ignoring you, just juggling a lot " +
  "right now. Feel free to hang around and keep typing, I'll jump in the " +
  "second I see this. Or if you'd rather reach me directly, here's where I " +
  "actually reply:";

async function handleMessage(request: Request, env: Env): Promise<Response> {
  let body: { sessionId?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(env, { error: "invalid JSON body" }, 400);
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!sessionId) return jsonResponse(env, { error: "sessionId is required" }, 400);
  if (!text) return jsonResponse(env, { error: "text is required" }, 400);
  if (text.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(env, { error: "text is too long" }, 400);
  }

  const session = (await getSession(env, sessionId)) ?? newSession(sessionId);

  if (session.messages.length >= MAX_MESSAGES_PER_SESSION) {
    return jsonResponse(env, { error: "message limit reached for this session" }, 429);
  }

  const visitorMessage = appendMessage(session, "visitor", text);
  const classification = classifyMessage(text);

  if (classification === "greeting") {
    appendMessage(session, "system", GREETING_REPLY);
    await putSession(env, session);
    return jsonResponse(env, {
      sessionId,
      classification,
      awaitingReply: session.awaitingReply,
      messages: session.messages.filter((m) => m.seq >= visitorMessage.seq),
    });
  }

  // Substantive: forward to the owner on Telegram, no canned reply, start
  // the reply-window clock.
  const windowMs = Number(env.WHALE_REPLY_WINDOW_MS) || 120_000;
  const { messageId } = await sendTelegramMessage(
    env,
    `New whale-chat message:\n\n${text}\n\n(reply to this message to answer them)`
  );

  session.telegramMessageId = messageId;
  session.awaitingReply = true;
  session.fallbackSent = false;
  session.deadlineAt = Date.now() + windowMs;
  await setTelegramIndex(env, messageId, sessionId);
  await setPending(env, sessionId, session.deadlineAt);
  await putSession(env, session);

  return jsonResponse(env, {
    sessionId,
    classification,
    awaitingReply: true,
    telegramMessageId: messageId,
    messages: session.messages.filter((m) => m.seq >= visitorMessage.seq),
  });
}

async function handlePoll(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  const sinceSeq = Number(url.searchParams.get("sinceSeq") ?? "0") || 0;

  if (!sessionId) return jsonResponse(env, { error: "sessionId is required" }, 400);

  const session = await getSession(env, sessionId);
  if (!session) {
    return jsonResponse(env, { messages: [], lastSeq: 0, awaitingReply: false, fallbackSent: false });
  }

  return jsonResponse(env, {
    messages: session.messages.filter((m) => m.seq > sinceSeq),
    lastSeq: session.lastSeq,
    awaitingReply: session.awaitingReply,
    fallbackSent: session.fallbackSent,
  });
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  if (!verifyWebhookSecret(request, env)) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    // Malformed body from an otherwise-authenticated caller — still ack 200
    // so Telegram doesn't treat this as a delivery failure and retry/disable.
    return new Response("ok", { status: 200 });
  }

  const reply = parseOwnerReply(update, env);

  if (!reply) {
    // A message from the owner's chat that isn't threaded to a forwarded
    // visitor message — we can't tell who it's for, so ask them to use
    // Telegram's reply feature instead of guessing.
    const isOwnerChat =
      update.message && env.TELEGRAM_OWNER_CHAT_ID &&
      String(update.message.chat.id) === env.TELEGRAM_OWNER_CHAT_ID;
    if (isOwnerChat && update.message?.text) {
      await sendTelegramMessage(
        env,
        "Reply directly to a forwarded visitor message to answer them."
      );
    }
    return new Response("ok", { status: 200 });
  }

  const sessionId = await getSessionIdForTelegramMessage(env, reply.repliedToMessageId);
  if (!sessionId) return new Response("ok", { status: 200 });

  const session = await getSession(env, sessionId);
  if (!session) return new Response("ok", { status: 200 });

  appendMessage(session, "owner", reply.text);
  session.awaitingReply = false;
  session.deadlineAt = null;
  await putSession(env, session);
  await clearPending(env, sessionId);

  return new Response("ok", { status: 200 });
}

async function handleScheduled(env: Env): Promise<void> {
  const now = Date.now();
  const pending = await listPendingEntries(env);

  for (const entry of pending) {
    if (entry.deadlineAt > now) continue;

    const session = await getSession(env, entry.sessionId);
    if (!session || !session.awaitingReply || session.fallbackSent) {
      await clearPending(env, entry.sessionId);
      continue;
    }

    appendMessage(session, "system", FALLBACK_TEXT, "fallback");
    session.fallbackSent = true;
    session.awaitingReply = false;
    await putSession(env, session);
    await clearPending(env, entry.sessionId);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return handleOptions(env);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(env, { ok: true });
    }

    if (url.pathname === "/api/message" && request.method === "POST") {
      return handleMessage(request, env);
    }

    if (url.pathname === "/api/messages" && request.method === "GET") {
      return handlePoll(request, env);
    }

    if (url.pathname === "/api/telegram-webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    return new Response("not found", { status: 404, headers: corsHeaders(env) });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
