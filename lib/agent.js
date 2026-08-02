import { EX } from './examples';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `You convert a customer's revision request for custom vehicle artwork into a checklist for the artist.

RULES
- Never invent, never drop, never resolve ambiguity. If unclear, put it in "clarifications" in the customer's own words. The artist will ask.
- Copy customer-specified text character for character. Never correct spelling, punctuation or capitalisation in text the customer wants ON the artwork, including names. Never comment on it.
- One change per line. Never merge two changes.
- If an item is not artwork (sizing, quantities, adding a product, sending files, shipping, billing), put it in "cs_items" and nowhere else. If unsure, put it in "cs_items".
- If the order covers more than one vehicle or product and the changes apply to only one, name it in "subject".
- Note attachments and references the customer points to in "reference_notes".
- If the customer approves part of the work as-is, record that in "no_change_notes".

Reply with JSON only. No preamble, no markdown fences.
{"subject":string|null,"changes":[string],"clarifications":[string],"no_change_notes":[string],"reference_notes":[string],"cs_items":[string]}`;

export async function parseRevision(text) {
  const messages = [];
  for (const [input, output] of EX) {
    messages.push({ role: 'user', content: input });
    messages.push({ role: 'assistant', content: JSON.stringify(output) });
  }
  messages.push({ role: 'user', content: text });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));

  const raw = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .replace(/```json|```/g, '')
    .trim();

  const p = JSON.parse(raw);
  return {
    subject: p.subject ?? null,
    changes: p.changes || [],
    clarifications: p.clarifications || [],
    no_change_notes: p.no_change_notes || [],
    reference_notes: p.reference_notes || [],
    cs_items: p.cs_items || [],
  };
}