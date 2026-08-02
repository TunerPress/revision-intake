import { findOrder, markNeedsRevision } from '@/lib/asana';
import { parseRevision } from '@/lib/agent';
import { createRevisionSubtask } from '@/lib/subtask';
import { createCsTasks } from '@/lib/cs';
import { insertSubmission, updateSubmission } from '@/lib/db';
import { attachFiles } from '@/lib/files';

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  const rawRef = (payload.orderRef || '').trim();
  const rawText = (payload.text || '').trim();
  if (!rawText) return Response.json({ ok: false, error: 'no_text' }, { status: 400 });

  let match = null;
  try {
    match = await findOrder(rawRef);
  } catch (e) {
    match = { ok: false, reason: 'lookup_error', error: e.message };
  }

  // Save before anything can fail.
  let saved;
  try {
    saved = await insertSubmission({
      raw_order_ref: rawRef || null,
      order_ref: match?.ref || null,
      customer_email: (payload.email || '').trim() || null,
      customer_name: (payload.name || '').trim() || null,
      raw_text: rawText,
      asana_task_gid: match?.ok ? match.task.gid : null,
      matched_task_name: match?.ok ? match.task.name : null,
      asana_project_name: match?.ok ? match.task.project : null,
      task_completed: match?.ok ? match.completed : null,
      status: match?.ok ? 'matched' : 'unmatched',
    });
  } catch (e) {
    return Response.json({ ok: false, error: 'save_failed', detail: e.message }, { status: 500 });
  }

  const reply = { ok: true, id: saved.id, matched: !!match?.ok, parsed: null };

  try {
    const parsed = await parseRevision(rawText);
    reply.parsed = parsed;
    await updateSubmission(saved.id, { parsed_json: parsed, status: 'parsed' });

    if (match?.ok) {
      const sub = await createRevisionSubtask(match.task.gid, parsed);
      await markNeedsRevision(match.task.gid, match.task.project);
      await updateSubmission(saved.id, { asana_subtask_gid: sub.gid, status: 'posted' });
      if (payload.files?.length) await attachFiles(saved.id, sub.gid, payload.files);
      reply.task = { name: match.task.name, project: match.task.project };
    }
    const cs = await createCsTasks({
      ref: match?.ref,
      rawRef,
      parsed,
      matched: !!match?.ok,
      completed: match?.ok ? match.completed : false,
      taskName: match?.ok ? match.task.name : null,
      project: match?.ok ? match.task.project : null,
      rawText,
      email: (payload.email || '').trim(),
      customerName: (payload.name || '').trim(),
    });
    if (cs.length) await updateSubmission(saved.id, { cs_task_gid: cs[0] });
  } catch (e) {
    await updateSubmission(saved.id, { status: 'failed', error_text: String(e.message).slice(0, 500) });
  }

  return reply.ok ? Response.json(reply) : Response.json(reply, { status: 500 });
}