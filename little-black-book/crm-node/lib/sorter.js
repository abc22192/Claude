'use strict';
/**
 * sorter.js: reads a messy brain dump and proposes where each piece goes.
 *
 * Precision first. Every proposed item carries a confidence:
 *   high   = said plainly, safe to save now
 *   medium = probably right, waits for Bella's OK
 *   low    = a guess, waits and is shown as a question
 * The sorter never writes anything. It only returns a proposal. lib/dump.js applies it.
 * Nothing is dropped: the full dump is always saved word for word as a history entry.
 */
const fmt = require('./format');

const NUDGE_FELT = 'How did he make you feel? One line is enough.';
const NUDGE_TONE = 'Anything about his tone? Playful, shy, demanding, formal?';
const RANK = { low: 0, medium: 1, high: 2 };
const CONF = ['low', 'medium', 'high'];
const minConf = (a, b) => CONF[Math.min(RANK[a], RANK[b])];

/* ---------- small helpers ---------- */

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[a-z0-9]+/g) || [];
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function sentencesOf(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=[A-Z$@0-9"'(])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const STOP_NAMES = new Set([
  'the', 'sir', 'big', 'boy', 'man', 'him', 'her', 'new', 'old', 'guy', 'and', 'for', 'you', 'who', 'was', 'his',
  'she', 'they', 'got', 'one', 'not', 'but', 'yes', 'yeah', 'daddy', 'baby', 'dude', 'bro', 'sub', 'client',
  'buyer', 'fan', 'user', 'test', 'unknown', 'anon', 'nobody', 'someone', 'guest',
]);

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/* ---------- dates ---------- */

function dowOf(dateStr) {
  return fmt.parseDate(dateStr).getUTCDay();
}

/**
 * Find a date in a sentence. dir is 'past' (something happened) or 'future' (a reminder).
 * Returns 'YYYY-MM-DD' or null.
 */
function parseWhen(text, today, dir) {
  const s = String(text || '').toLowerCase();
  let m;
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s))) {
    const mo = Number(m[1]);
    const da = Number(m[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
      if (y < 100) y += 2000;
      let d = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
      if (!m[3]) {
        if (dir === 'past' && d > today) d = `${y - 1}-${d.slice(5)}`;
        if (dir === 'future' && d < today) d = `${y + 1}-${d.slice(5)}`;
      }
      return d;
    }
  }
  if ((m = new RegExp(`\\b(${MONTH_NAMES.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(s))) {
    const mo = MONTH_NAMES.indexOf(m[1]) + 1;
    const da = Number(m[2]);
    if (da >= 1 && da <= 31) {
      let y = Number(today.slice(0, 4));
      let d = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
      if (dir === 'past' && d > today) d = `${y - 1}-${d.slice(5)}`;
      if (dir === 'future' && d < today) d = `${y + 1}-${d.slice(5)}`;
      return d;
    }
  }
  if (/\b(yesterday|last night)\b/.test(s)) return fmt.addDays(today, -1);
  if (/\b(today|tonight|this morning|this afternoon|earlier|just now)\b/.test(s)) return today;
  if (/\btomorrow\b/.test(s)) return fmt.addDays(today, 1);
  if ((m = /\b(\d+)\s*days?\s*ago\b/.exec(s))) return fmt.addDays(today, -Number(m[1]));
  if ((m = /\b(\d+)\s*weeks?\s*ago\b/.exec(s))) return fmt.addDays(today, -7 * Number(m[1]));
  if (/\blast week\b/.test(s)) return fmt.addDays(today, -7);
  if ((m = /\bin\s+(\d+)\s*(day|week|month)s?\b/.exec(s))) {
    const n = Number(m[1]);
    return fmt.addDays(today, m[2] === 'day' ? n : m[2] === 'week' ? 7 * n : 30 * n);
  }
  if (/\b(?:in|after) a week\b|\bnext week\b/.test(s)) return fmt.addDays(today, 7);
  if (/\b(?:in|after) a month\b|\bnext month\b/.test(s)) return fmt.addDays(today, 30);
  if ((m = new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`).exec(s))) {
    const target = WEEKDAYS.indexOf(m[1]);
    const cur = dowOf(today);
    let diff;
    if (dir === 'future') {
      diff = (target - cur + 7) % 7;
      if (diff === 0) diff = 7;
      return fmt.addDays(today, diff);
    }
    diff = (cur - target + 7) % 7;
    return fmt.addDays(today, -diff);
  }
  return null;
}

/* ---------- platforms and handles ---------- */

const PLATFORM_WORDS = [
  ['telegram', /\b(telegram|tg)\b/i],
  ['onlyfans', /\bonly\s?fans\b/i],
  ['atw', /\b(atw|all\s?things\s?worn)\b/i],
  ['snapchat', /\bsnap(?:chat)?\b/i],
  ['instagram', /\b(insta(?:gram)?|ig)\b/i],
  ['x', /\b(twitter|x\.com)\b|\b(?:on|from|via|through|dm(?:s|ed)? on)\s+x\b/i],
  ['email', /\b(?:by|via|through|over)\s+e-?mail\b/i],
];

function platformsIn(s) {
  const out = [];
  for (const [key, re] of PLATFORM_WORDS) if (re.test(s)) out.push(key);
  return out;
}

const HANDLE_LABEL = /\b(telegram|tg|snapchat|snap|instagram|insta|ig|onlyfans|twitter|atw|x)\s*(?::\s*@?|\s+@)([A-Za-z0-9_.]{2,32})/gi;
const LABEL_TO_PLATFORM = {
  telegram: 'telegram', tg: 'telegram', snapchat: 'snapchat', snap: 'snapchat', instagram: 'instagram', insta: 'instagram',
  ig: 'instagram', onlyfans: 'onlyfans', twitter: 'x', atw: 'atw', x: 'x',
};

/* ---------- labeled fields ("Dream night: ...") ---------- */

const LABELS = [
  ['dream_night', 'dream\\s*night'],
  ['fetishes', 'fetish(?:es)?|kinks?'],
  ['tone', 'tone|vibe'],
  ['felt', 'how (?:he|they|she) made me feel|made me feel|how i felt|felt'],
  ['magic_words', 'magic\\s*words?'],
  ['likes_about_me', 'likes? about me|loves? about me|what (?:he|they) likes? about me'],
  ['call_me', 'calls? me'],
  ['plans', 'plans?'],
  ['red_flags', 'red\\s*flags?'],
  ['green_flags', 'green\\s*flags?'],
  ['payment_method', 'payment(?: method)?'],
  ['status', 'status'],
  ['notes', 'notes?'],
  ['email', 'e-?mail'],
];
const MULTILINE = new Set(['dream_night', 'notes', 'felt', 'plans']);
const FIELD_NAMES = {
  dream_night: 'Dream Night', fetishes: 'Fetishes', tone: 'Tone', felt: 'How they made me feel',
  magic_words: 'Magic words', likes_about_me: 'What they like about me', call_me: 'What they call me',
  plans: 'Plans', red_flags: 'Red flags', green_flags: 'Green flags', payment_method: 'Payment method',
  status: 'Status', notes: 'Notes', email: 'Email',
};
const SINGLE_VALUE = new Set(['tone', 'call_me', 'payment_method', 'status', 'email']);

const LABEL_RE = new RegExp(`(?<![\\w])(${LABELS.map(([, p]) => `(?:${p})`).join('|')})\\s*:\\s*`, 'gi');

function labelKey(matchText) {
  const low = matchText.toLowerCase().replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').trim();
  for (const [key, pat] of LABELS) {
    if (new RegExp(`^(?:${pat})$`, 'i').test(low)) return key;
  }
  return null;
}

/** Pull "Label: value" pieces out. Returns { fields, rest } where rest is the text with those pieces removed. */
function extractLabeled(text) {
  const matches = [];
  let m;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(text))) {
    const key = labelKey(m[1]);
    if (key) matches.push({ key, start: m.index, valueStart: m.index + m[0].length });
  }
  const fields = [];
  let rest = '';
  let cursor = 0;
  matches.forEach((cur, i) => {
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : text.length;
    let value = text.slice(cur.valueStart, nextStart);
    let tail = '';
    const blank = /\n\s*\n/.exec(value);
    if (blank) {
      tail = value.slice(blank.index);
      value = value.slice(0, blank.index);
    } else if (!MULTILINE.has(cur.key)) {
      const nl = value.indexOf('\n');
      if (nl >= 0) {
        tail = value.slice(nl);
        value = value.slice(0, nl);
      }
    }
    const action = /[.!]\s+(?=(?:follow\s*-?\s*up|remind me|check\s*in|reach out|circle back)\b)/i.exec(value);
    if (action) {
      tail = value.slice(action.index + 1) + tail;
      value = value.slice(0, action.index + 1);
    }
    value = clean(value.replace(/\s*[|;]\s*$/, ''));
    rest += text.slice(cursor, cur.start) + ' ' + tail;
    cursor = nextStart;
    if (value) fields.push({ key: cur.key, value });
  });
  rest += text.slice(cursor);
  return { fields, rest };
}

/* ---------- people ---------- */

function buildNameIndex(people) {
  const byKey = new Map();
  for (const p of people) {
    const t = tokens(p.name);
    if (!t.length || t.length > 5) continue;
    if (t.length === 1 && (t[0].length < 3 || STOP_NAMES.has(t[0]))) continue;
    const key = t.join(' ');
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(p);
  }
  return byKey;
}

/** Every known person mentioned in the text, with where they start. */
function scanKnown(text, byKey) {
  const t = tokens(text);
  const hits = [];
  for (let i = 0; i < t.length; i++) {
    for (let len = Math.min(5, t.length - i); len >= 1; len--) {
      const key = t.slice(i, i + len).join(' ');
      const found = byKey.get(key);
      if (found) {
        hits.push({ start: i, len, people: found });
        i += len - 1; // longest match wins, skip past it
        break;
      }
    }
  }
  return hits;
}

const NEW_PERSON_PATTERNS = [
  /(?:^|\n)\s*(?:name|client|person|buyer)\s*:\s*@?([^\n,;|]{2,60})/i,
  /(?:^|\n)\s*(?:new|met a new)\s+(?:guy|man|person|client|buyer|sub|contact|one|fan)\s*(?::|-|,|named|called)?\s*@?([A-Za-z][\w'.-]*(?:\s+[A-Za-z][\w'.-]*)?)/i,
  /\bmet\s+(?:a\s+)?(?:guy|man|someone|person|buyer)\s+(?:named|called)\s+@?([A-Za-z][\w'.-]*(?:\s+[A-Z][\w'.-]*)?)/i,
];

const LEAD_VERBS = 'bought|paid|tipped|sent|ordered|wants|asked|said|messaged|texted|spent|loves|got|called|came|ghosted|pm|dm|dmed|wrote|replied|returned|booked|subscribed|joined';
const LEADING_NAME = new RegExp(`^@?([A-Z][\\w'.-]{1,30}(?:\\s[A-Z][\\w'.-]{1,30})?)\\s*(?:[:\\-\\u2013\\u2014,]\\s|\\s(?:${LEAD_VERBS})\\b)`);
const NOT_A_NAME = new Set(['i', 'he', 'she', 'they', 'we', 'today', 'yesterday', 'also', 'note', 'notes', 'new', 'follow', 'reminder', 'dream', 'bella', 'tone', 'plans', 'status', 'felt', 'remember', 'update', 'call', 'sale', 'money', 'paid', 'email']);

function resolvePerson(text, ctx) {
  const idx = ctx.index || { people: [], handles: new Map(), ids: new Map() };
  const byId = new Map(idx.people.map((p) => [p.id, p]));
  const found = (p, conf, reason, extra) => ({ id: p.id, name: p.name, isNew: false, conf, reason, candidates: [], ...extra });

  if (ctx.forcePersonId && byId.has(Number(ctx.forcePersonId))) {
    return found(byId.get(Number(ctx.forcePersonId)), 'high', 'You picked this person.');
  }
  if (ctx.forceNewName) {
    return { id: null, name: clean(ctx.forceNewName), isNew: true, conf: 'high', reason: 'You said this is someone new.', candidates: [] };
  }
  if (ctx.externalId && idx.ids.has(String(ctx.externalId))) {
    return found(byId.get(idx.ids.get(String(ctx.externalId))), 'high', 'Matched their Telegram ID.');
  }
  if (ctx.username) {
    const pid = idx.handles.get(String(ctx.username).replace(/^@/, '').toLowerCase());
    if (pid && byId.has(pid)) return found(byId.get(pid), 'high', 'Matched their username.');
  }

  // @handles typed in the dump
  const handlePeople = new Set();
  for (const hm of String(text).matchAll(/@([A-Za-z0-9_.]{3,32})/g)) {
    const pid = idx.handles.get(hm[1].toLowerCase());
    if (pid) handlePeople.add(pid);
  }
  if (handlePeople.size === 1) {
    const p = byId.get([...handlePeople][0]);
    if (p) return found(p, 'high', 'Matched a username you typed.');
  }

  const byKey = buildNameIndex(idx.people);

  // Explicit "New guy: Mike" or "Name: Mike"
  let newName = null;
  for (const re of NEW_PERSON_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      newName = clean(m[1]).replace(/[.:]+$/, '');
      break;
    }
  }
  if (newName) {
    const key = tokens(newName).join(' ');
    const known = byKey.get(key);
    if (known && known.length === 1) return found(known[0], 'high', 'You named them and they are already in the book.');
    if (known && known.length > 1) {
      return { id: null, name: newName, isNew: false, conf: 'low', reason: `More than one person is called ${newName}.`, candidates: known.slice(0, 4).map((p) => ({ id: p.id, name: p.name })) };
    }
    return { id: null, name: newName, isNew: true, conf: 'high', reason: 'You said this is someone new.', candidates: [] };
  }

  // Known names inside the text
  const hits = scanKnown(text, byKey);
  if (hits.length) {
    const first = hits[0];
    const distinct = new Map();
    for (const h of hits) for (const p of h.people) distinct.set(p.id, p);
    if (first.start === 0) {
      if (first.people.length === 1 && (distinct.size === 1 || first.len > 1 || true)) {
        return found(first.people[0], 'high', 'Their name is at the start.');
      }
      return { id: null, name: null, isNew: false, conf: 'low', reason: 'Two people share that name.', candidates: first.people.slice(0, 4).map((p) => ({ id: p.id, name: p.name })) };
    }
    if (distinct.size === 1) return found([...distinct.values()][0], 'medium', 'Their name appears in the text.');
    return { id: null, name: null, isNew: false, conf: 'low', reason: 'More than one known name appears.', candidates: [...distinct.values()].slice(0, 4).map((p) => ({ id: p.id, name: p.name })) };
  }

  // A capitalized first word looks like someone new
  const lead = LEADING_NAME.exec(String(text).trim());
  if (lead) {
    const word = clean(lead[1]);
    if (!NOT_A_NAME.has(word.toLowerCase().split(' ')[0])) {
      return { id: null, name: word, isNew: true, conf: 'medium', reason: 'Starts with a name I do not know yet.', candidates: [] };
    }
  }
  return { id: null, name: null, isNew: false, conf: 'low', reason: 'I could not tell who this is about.', candidates: [] };
}

/* ---------- sales ---------- */

const NEGATION = /\b(didn'?t|did not|won'?t|wouldn'?t|never|not going to|might|maybe|thinking (?:about|of)|wants? to (?:buy|pay)|asked (?:about|for) (?:the )?price|if he|if they|would|could|should|hasn'?t|haven'?t|can'?t|couldn'?t|declined|refused|no money|will pay|will buy|going to (?:buy|pay)|plans? to|hopes? to|owes?|owed)\b/i;
const PAID_VERB = /\b(bought|purchased|paid|tipped|ordered|spent|sent me|sent|tributed|dropped|renewed|upgraded|subscribed|picked up|cashapped|venmoed|zelled)\b/i;
const AMOUNT_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:dollars|bucks|usd)\b/gi;
const BE_RE = /\bbella\s*effect\b/i;
const LEVEL_RE = /\bL\s?([1-4])\b|\blevel\s*([1-4])\b|\btier\s*([1-4])\b/i;

const KIND_WORDS = [
  ['bella_effect', BE_RE],
  ['tip', /\btips?\b|\btipped\b/i],
  ['custom', /\bcustoms?\b/i],
  ['call', /\b(video call|face\s?time|call|live|private show|zoom)\b/i],
  ['clip', /\b(clips?|videos?|vids?)\b/i],
  ['audio', /\b(audios?|asmr|voice\s?notes?|recording)\b/i],
  ['vault', /\b(vault|membership|subscription|sub)\b/i],
  ['worn', /\b(worn|panties|socks|shirt|bra|used|stockings|thong)\b/i],
  ['other', /\binhalers?\b/i],
];

function kindOf(s) {
  for (const [key, re] of KIND_WORDS) if (re.test(s)) return key;
  return null;
}

function amountsIn(s) {
  const out = [];
  AMOUNT_RE.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RE.exec(s))) {
    let v;
    if (m[1] !== undefined) v = Number(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
    else v = Number(m[3].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0) out.push({ value: v, index: m.index, length: m[0].length });
  }
  return out;
}

function titleFor(fragment, kind, level) {
  if (kind === 'bella_effect') return level ? `Bella Effect ${level}` : 'Bella Effect';
  if (/\binhalers?\b/i.test(fragment)) return 'Inhaler';
  const base = fmt.KINDS[kind] || 'Purchase';
  const m = /\bfor\s+(?:a |an |the |his |her )?([^.,;$]{3,40}?)(?:\s+(?:on|via|from|at|yesterday|today|last)\b|$|[.,;])/i.exec(fragment);
  if (m) {
    const phrase = clean(m[1]);
    const sameAsKind = kind && kindOf(phrase) === kind && phrase.split(' ').length <= 2;
    if (phrase && !/^\d/.test(phrase) && !sameAsKind && !new RegExp(`^${base}`, 'i').test(phrase)) {
      return kind && kind !== 'other' ? `${base}: ${phrase}` : phrase.charAt(0).toUpperCase() + phrase.slice(1);
    }
  }
  return kind && kind !== 'other' ? base : 'Purchase';
}

function extractSales(sentences, ctx, textPlatforms) {
  const items = [];
  const nudges = [];
  for (const sentence of sentences) {
    const amounts = amountsIn(sentence);
    const hasVerb = PAID_VERB.test(sentence);
    const kind = kindOf(sentence);
    if (!amounts.length && !(hasVerb && kind)) continue;
    if (NEGATION.test(sentence)) {
      if (amounts.length) nudges.push(`I saw an amount in "${clean(sentence).slice(0, 80)}" but it sounded like it had not happened yet, so I did not log a sale. Use + Sale if it did.`);
      continue;
    }
    if (!hasVerb && !(amounts.length && kind)) continue; // a lone number is not a sale

    // Split into pieces when there is more than one amount, so each gets its own sale
    let pieces = [sentence];
    if (amounts.length > 1) {
      const split = sentence.split(/\s*(?:,|;|\+|&|\band\b)\s*/i).filter((p) => amountsIn(p).length === 1);
      if (split.length === amounts.length) pieces = split;
    }
    for (const piece of pieces) {
      const amt = amountsIn(piece)[0] || null;
      const k = kindOf(piece) || kindOf(sentence) || 'other';
      const lv = LEVEL_RE.exec(piece) || LEVEL_RE.exec(sentence);
      const level = k === 'bella_effect' && lv ? 'L' + (lv[1] || lv[2] || lv[3]) : null;
      const plats = platformsIn(piece).length ? platformsIn(piece) : platformsIn(sentence);
      const platform = plats.length === 1 ? plats[0] : (!plats.length && textPlatforms.length === 1 ? textPlatforms[0] : null);
      const when = parseWhen(sentence, ctx.today, 'past');
      const title = titleFor(piece, k, level);
      let status = 'confirmed';
      let reason = null;
      if (!amt) { status = 'unconfirmed'; reason = 'No amount was given.'; }
      else if (amt.value > 5000) { status = 'unconfirmed'; reason = 'The amount looks very large. Please check it.'; }
      const conf = hasVerb ? 'high' : 'medium';
      items.push({
        type: 'sale',
        conf,
        label: `Sale: ${title}${amt ? ' for ' + fmt.money(amt.value) : ' (no amount yet)'}`,
        data: {
          title, kind: k, level, amount: amt ? amt.value : null, platform, occurred_on: when || ctx.today,
          status, unconfirmed_reason: reason, notes: clean(piece).slice(0, 300),
        },
      });
      if (!platform) nudges.push(`Where did "${title}" happen? Telegram, X, OnlyFans, somewhere else?`);
    }
  }
  return { items, nudges };
}

/* ---------- main ---------- */

/**
 * sort(text, ctx)
 * ctx: { today, index: {people, handles, ids}, forcePersonId, externalId, username, forwarded, source }
 * Returns { person, items, nudges }.
 */
function sort(text, ctx) {
  const raw = String(text || '').trim();
  const today = ctx.today || fmt.today();
  const c = { ...ctx, today };
  let person = resolvePerson(raw, c);
  if (c.forwarded && person.conf === 'low' && c.suggestName) {
    const same = (buildNameIndex((c.index && c.index.people) || []).get(tokens(c.suggestName).join(' ')) || []).slice(0, 4);
    if (same.length) {
      person = { id: null, name: null, isNew: false, conf: 'low', reason: `The sender's name matches someone in your book. Tap who it is.`, candidates: same.map((p) => ({ id: p.id, name: p.name })) };
    } else person = { id: null, name: clean(c.suggestName), isNew: true, conf: 'medium', reason: 'Forwarded from a Telegram user who is not in your book yet.', candidates: [] };
  }
  const items = [];
  const nudges = [];
  const textPlatforms = platformsIn(raw);

  // The full dump, word for word, goes on their history. Nothing is lost.
  items.push({
    type: 'interaction',
    conf: 'high',
    label: c.forwarded ? 'History: what they wrote' : 'History: your note, saved word for word',
    data: { summary: c.forwarded ? `They wrote: ${raw}` : raw, platform: textPlatforms.length === 1 ? textPlatforms[0] : null },
  });

  if (!c.forwarded) {
    const { fields, rest } = extractLabeled(raw);

    for (const f of fields) {
      let value = f.value;
      let conf = 'high';
      if (f.key === 'status') {
        const v = value.toLowerCase();
        if (!fmt.STATUSES[v]) continue;
        value = v;
      }
      if (f.key === 'email') {
        const em = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(value);
        if (!em) continue;
        value = em[0];
      }
      items.push({
        type: 'field',
        conf,
        label: `${FIELD_NAMES[f.key]}: ${value.length > 90 ? value.slice(0, 90) + '…' : value}`,
        data: { field: f.key, value, mode: SINGLE_VALUE.has(f.key) ? 'set' : 'append' },
      });
    }

    // A plain email address anywhere
    if (!fields.some((f) => f.key === 'email')) {
      const em = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(rest);
      if (em) items.push({ type: 'field', conf: 'high', label: `Email: ${em[0]}`, data: { field: 'email', value: em[0], mode: 'set' } });
    }

    const sentences = sentencesOf(rest);

    // Handles
    const seenHandles = new Set();
    HANDLE_LABEL.lastIndex = 0;
    let hm;
    while ((hm = HANDLE_LABEL.exec(rest))) {
      const platform = LABEL_TO_PLATFORM[hm[1].toLowerCase()];
      const username = hm[2].replace(/[.]+$/, '');
      const key = platform + ':' + username.toLowerCase();
      if (seenHandles.has(key)) continue;
      seenHandles.add(key);
      items.push({ type: 'platform', conf: 'high', label: `${fmt.PLATFORMS[platform]}: @${username}`, data: { platform, username } });
    }
    for (const s of sentences) {
      const alias = /\b(?:is now|now goes by|now|changed (?:his|her|their) (?:user ?name|handle|name) to|new (?:user ?name|handle)(?: is)?|renamed (?:to|himself)|also (?:goes by|known as)|aka|a\.k\.a\.)\s*:?\s*@([A-Za-z0-9_.]{3,32})/i.exec(s);
      if (alias && !idxHasHandle(c.index, alias[1])) {
        const plats = platformsIn(s);
        const platform = plats.length === 1 ? plats[0] : (c.source === 'telegram' ? 'telegram' : (textPlatforms.length === 1 ? textPlatforms[0] : null));
        const username = alias[1].replace(/[.]+$/, '');
        if (platform && !seenHandles.has(platform + ':' + username.toLowerCase())) {
          seenHandles.add(platform + ':' + username.toLowerCase());
          items.push({ type: 'platform', conf: 'high', label: `New username: ${fmt.PLATFORMS[platform]} @${username}`, data: { platform, username } });
        }
        continue;
      }
      const bare = [...s.matchAll(/(?<![\w.])@([A-Za-z0-9_.]{3,32})/g)].map((x) => x[1].replace(/[.]+$/, ''));
      if (!bare.length) continue;
      const plats = platformsIn(s);
      for (const username of bare) {
        if ([...seenHandles].some((k) => k.endsWith(':' + username.toLowerCase()))) continue;
        if (idxHasHandle(c.index, username)) continue;
        if (plats.length === 1) {
          seenHandles.add(plats[0] + ':' + username.toLowerCase());
          items.push({ type: 'platform', conf: 'high', label: `${fmt.PLATFORMS[plats[0]]}: @${username}`, data: { platform: plats[0], username } });
        } else if (!(person.isNew && tokens(person.name).join('') === tokens(username).join(''))) {
          nudges.push(`Which platform is @${username} on?`);
        }
      }
    }

    // Sales
    const sales = extractSales(sentences, c, textPlatforms);
    items.push(...sales.items);
    nudges.push(...sales.nudges);
    for (const sale of sales.items) {
      const d = sale.data;
      if (d.kind === 'bella_effect') items.push({ type: 'flag', conf: sale.conf, label: 'Knows Bella Effect', data: { field: 'knows_bella_effect' } });
      if (d.kind === 'audio') items.push({ type: 'flag', conf: sale.conf, label: 'Knows audio', data: { field: 'knows_audio' } });
      if (/inhaler/i.test(d.title)) items.push({ type: 'flag', conf: sale.conf, label: 'Knows inhalers', data: { field: 'knows_inhalers' } });
    }
    if (BE_RE.test(rest) && !sales.items.some((s) => s.data.kind === 'bella_effect')) {
      nudges.push('I saw Bella Effect mentioned. If he bought it, tell me the level and the amount and I will log the sale.');
    }

    // Follow-up reminders
    for (const s of sentences) {
      if (!/\b(follow\s*-?\s*up|check\s*in|remind me|reach out|message him|message her|text him|text her|ping him|circle back)\b/i.test(s)) continue;
      if (/\b(didn'?t|did not|already|just)\b/i.test(s) && !/\b(remind me|follow up (?:in|on|next))\b/i.test(s)) continue;
      const due = parseWhen(s, today, 'future');
      if (due && due > today) {
        items.push({ type: 'followup', conf: 'high', label: `Reminder on ${fmt.dateShort(due)}: ${clean(s).slice(0, 80)}`, data: { due_on: due, reason: clean(s).slice(0, 200) } });
      } else {
        nudges.push(`When should I remind you about "${clean(s).slice(0, 60)}"?`);
      }
    }

    // Things worth a second look (medium: they wait for an OK)
    for (const s of sentences) {
      if (/\b(made me feel|i felt|makes me feel)\b/i.test(s) && !fields.some((f) => f.key === 'felt')) {
        items.push({ type: 'field', conf: 'medium', label: `How they made me feel: ${clean(s).slice(0, 90)}`, data: { field: 'felt', value: clean(s), mode: 'append' } });
      }
      if (/\b(next time|wants? (?:to|me to)|asked (?:me )?(?:for|about|if))\b/i.test(s) && !NEGATION.test(s) && !fields.some((f) => f.key === 'plans')) {
        if (!/\b(follow\s*-?\s*up|check\s*in|remind me)\b/i.test(s)) {
          items.push({ type: 'field', conf: 'medium', label: `Plans: ${clean(s).slice(0, 90)}`, data: { field: 'plans', value: clean(s), mode: 'append' } });
        }
      }
      if (/\bghost(?:ed|ing)\b/i.test(s) && !/\bnot\b/i.test(s) && !fields.some((f) => f.key === 'status')) {
        items.push({ type: 'field', conf: 'medium', label: 'Status: Ghosted', data: { field: 'status', value: 'ghosted', mode: 'set' } });
      }
      if (/\binto\b/i.test(s) && !fields.some((f) => f.key === 'fetishes')) {
        const m = /\b(?:he'?s|they'?re|she'?s|he is|is)?\s*into\s+([^.;\n]{3,80})/i.exec(s);
        if (m) {
          const v = clean(m[1].split(/\s+(?:and|but|so|because|when|since|which)\s+(?:he|she|they|it|i|made|makes|that)\b/i)[0]);
          if (v.length >= 3) items.push({ type: 'field', conf: 'medium', label: `Fetishes: ${v}`, data: { field: 'fetishes', value: v, mode: 'append' } });
        }
      }
    }

    // Nudges that help her add what she may have forgotten
    const has = (k) => fields.some((f) => f.key === k);
    if (person.conf !== 'low' && !has('felt') && !items.some((i) => i.data && i.data.field === 'felt')) nudges.push(NUDGE_FELT);
    if (person.conf !== 'low' && !has('tone')) nudges.push(NUDGE_TONE);
    if (person.isNew && !items.some((i) => i.type === 'platform')) nudges.push('What is his username, and where did you meet him?');
  } else {
    nudges.push('This was a forwarded message. I saved it on their history. Tell me anything you want remembered about it.');
  }

  // Confidence can never be higher than how sure we are about the person
  for (const it of items) it.conf = minConf(it.conf, person.conf);

  items.forEach((it, i) => { it.id = 'i' + (i + 1); });
  const uniqueNudges = [...new Set(nudges)].slice(0, 5);
  return { person, items, nudges: uniqueNudges };
}

function idxHasHandle(index, username) {
  return !!(index && index.handles && index.handles.has(String(username).toLowerCase()));
}

module.exports = { NUDGE_FELT, NUDGE_TONE, sort, parseWhen, resolvePerson, extractLabeled, platformsIn, FIELD_NAMES, SINGLE_VALUE, tokens };
