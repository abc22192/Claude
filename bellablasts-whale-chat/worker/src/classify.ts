import type { MessageClassification } from "./types";

// Bare greetings get an instant canned reply and never ping the owner.
// Anything else is treated as "substantive" and forwarded to Telegram —
// deliberately biased toward substantive, since a missed real inquiry is
// worse than one extra notification. This is the one file to edit to tune
// what counts as "just saying hi".
const GREETING_RE =
  /^(hi|hey|hello|hiya|yo|sup|wassup|hey there|hi there|good (morning|afternoon|evening)|how(?:'|’)?s it going|how are (?:you|u)|what(?:'|’)?s up|whats up)$/;

const GREETING_WORDS = new Set([
  "hi", "hey", "hello", "hiya", "yo", "sup", "wassup", "there", "how", "are",
  "you", "u", "whats", "what's", "up", "good", "morning", "afternoon",
  "evening", "doing", "going", "it's", "its",
]);

export function classifyMessage(raw: string): MessageClassification {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/[!?.,]+$/g, "")
    .replace(/\s+/g, " ");

  if (GREETING_RE.test(text)) return "greeting";

  const words = text.split(" ").filter(Boolean);
  if (
    words.length > 0 &&
    words.length <= 4 &&
    text.length <= 30 &&
    words.every((w) => GREETING_WORDS.has(w))
  ) {
    return "greeting";
  }

  return "substantive";
}
