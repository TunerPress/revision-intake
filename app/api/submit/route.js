import { findOrder } from '@/lib/asana';

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;

async function insertSubmission(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body[0];
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  const rawRef = (payload.orderRef || '').trim();
  const rawText = (payload.text || '').trim();
  const email = (payload.email || '').trim();

  if (!rawText) {
    return Response.json({ ok: false, error: 'no_text' }, { status: 400 });
  }

  // Look up first, but never let a lookup failure lose the submission.
  let match = null;
  try {
    match = await findOrder(rawRef);
  } catch (e) {
    match = { ok: false, reason: 'lookup_error', error: e.message };
  }

  const row = {
    raw_order_ref: rawRef || null,
    order_ref: match?.ref || null,
    customer_email: email || null,
    customer_name: (payload.name || '').trim() || null,
    raw_text: rawText,
    asana_task_gid: match?.ok ? match.task.gid : null,
    matched_task_name: match?.ok ? match.task.name : null,
    asana_project_name: match?.ok ? match.task.project : null,
    task_completed: match?.ok ? match.completed : null,
    status: match?.ok ? 'matched' : 'unmatched',
  };

  try {
    const saved = await insertSubmission(row);
    return Response.json({
      ok: true,
      id: saved.id,
      status: saved.status,
      matched: !!match?.ok,
      task: match?.ok ? { name: match.task.name, project: match.task.project } : null,
      completed: match?.ok ? match.completed : null,
    });
  } catch (e) {
    return Response.json({ ok: false, error: 'save_failed', detail: e.message }, { status: 500 });
  }
}