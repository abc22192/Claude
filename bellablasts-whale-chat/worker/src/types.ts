export interface Env {
  CHAT_KV: KVNamespace;
  ALLOWED_ORIGIN: string;
  WHALE_REPLY_WINDOW_MS: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_OWNER_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export type MessageFrom = "visitor" | "owner" | "system";

export interface ChatMessage {
  id: string;
  from: MessageFrom;
  text: string;
  seq: number;
  ts: number;
  // "fallback" marks the 2-minute no-reply message so the widget knows to
  // render the contact-channel buttons alongside it, instead of parsing text.
  kind?: "fallback";
}

export interface SessionRecord {
  id: string;
  createdAt: number;
  messages: ChatMessage[];
  lastSeq: number;
  awaitingReply: boolean;
  deadlineAt: number | null;
  fallbackSent: boolean;
  telegramMessageId: number | null;
}

export type MessageClassification = "greeting" | "substantive";
