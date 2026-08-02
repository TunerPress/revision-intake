const BASE = 'https://app.asana.com/api/1.0';

export function formatNotes(parsed) {
  const L = [];

  if (parsed.subject) L.push(`SUBJECT: ${parsed.subject}`, '');

  L.push('CHANGES', '');
  if (parsed.changes.length) {
    parsed.changes.forEach((c, i) => L.push(`${i + 1}. ${c}`));
  } else {
    L.push('(none identified - see clarifications below)');
  }

  if (parsed.clarifications.length) {
    L.push('', 'NEEDS CLARIFICATION');
    parsed.clarifications.forEach((c) => L.push(`- ${c}`));
  }
  if (parsed.no_change_notes.length) {
    L.push('', 'NO CHANGES');
    parsed.no_change_notes.forEach((c) => L.push(`- ${c}`));
  }
  if (parsed.reference_notes.length) {
    L.push('', 'REFERENCE');
    parsed.reference_notes.forEach((c) => L.push(`- ${c}`));
  }
  if (parsed.cs_items.length) {
    const n = parsed.cs_items.length;
    L.push('', `${n} item${n > 1 ? 's' : ''} routed to Customer Service.`);
  }

  return L.join('\n');
}

export async function createRevisionSubtask(parentGid, parsed, when = new Date()) {
  const date = when.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });

  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ASANA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        parent: parentGid,
        name: `Revision request - ${date}`,
        notes: formatNotes(parsed),
        due_at: new Date(when.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.errors || res.status));

  const dueAt = new Date(when.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const upd = await fetch(`${BASE}/tasks/${json.data.gid}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.ASANA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { due_at: dueAt } }),
  });
  const updJson = await upd.json();
  if (!upd.ok) throw new Error('due date failed: ' + JSON.stringify(updJson.errors));
  return updJson.data;
}