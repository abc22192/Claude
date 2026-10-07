'use strict';
/**
 * ai.js: an optional second opinion on a brain dump. Only runs when ANTHROPIC_API_KEY is set.
 * Anything it adds is capped at "medium", so it always waits for Bella's OK. It never decides who a note is about.
 */
const { config } = require('./config');
const fmt = require('./format');

const FIELDS = ['dream_night', 'fetishes', 'tone', 'felt', 'magic_words', 'likes_about_me', 'plans', 'red_flags', 'green_flags', 'notes'];

function enabled() {
  return !!config.anthropicKey;
}

async function suggest(text, alreadyFound) {
  if (!enabled()) return [];
  const prompt = `You help a business owner file private notes about a client. Read the note and list extra facts worth remembering that are NOT already captured.
Only use these fields: ${FIELDS.join(', ')}. Quote the note's own words. Do not invent anything. Do not mention sales or money.
Already captured: ${JSON.stringify(alreadyFound)}
Reply with JSON only, shaped like {"fields":[{"field":"fetishes","value":"..."}]}. If nothing is worth adding, reply {"fields":[]}.

NOTE:
${text}`;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.anthropicModel, max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const out = (data.content && data.content[0] && data.content[0].text) || '';
    const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    return (json.fields || [])
      .filter((f) => FIELDS.includes(f.field) && typeof f.value === 'string' && f.value.trim() && text.toLowerCase().includes(f.value.trim().toLowerCase().slice(0, 12)))
      .slice(0, 4)
      .map((f) => ({
        type: 'field',
        conf: 'medium',
        label: `${f.field.replace(/_/g, ' ')} (AI idea): ${f.value.trim().slice(0, 90)}`,
        data: { field: f.field, value: f.value.trim(), mode: f.field === 'tone' ? 'set' : 'append' },
      }));
  } catch (_) {
    return [];
  }
}

module.exports = { enabled, suggest, FIELDS, today: fmt.today };
