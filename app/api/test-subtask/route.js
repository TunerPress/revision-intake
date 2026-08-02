import { findOrder, markNeedsRevision } from '@/lib/asana';
import { parseRevision } from '@/lib/agent';
import { createRevisionSubtask } from '@/lib/subtask';

export async function POST(request) {
  const { ref, text } = await request.json();

  const match = await findOrder(ref || '99999');
  if (!match.ok) return Response.json({ step: 'lookup', match }, { status: 400 });

  const parsed = await parseRevision(text);
  const sub = await createRevisionSubtask(match.task.gid, parsed);
  const moved = await markNeedsRevision(match.task.gid, match.task.project);

  return Response.json({
    parsed,
    subtask: { gid: sub.gid, name: sub.name, due_at: sub.due_at, due_on: sub.due_on },
    moved,
  });
}