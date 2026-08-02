import { findOrder, markNeedsRevision } from '@/lib/asana';

export async function GET(request) {
  const ref = new URL(request.url).searchParams.get('ref') || '99999';

  const match = await findOrder(ref);
  if (!match.ok) return Response.json({ step: 'lookup', match });

  const moved = await markNeedsRevision(match.task.gid, match.task.project);
  return Response.json({
    task: match.task.name,
    project: match.task.project,
    moved,
  });
}