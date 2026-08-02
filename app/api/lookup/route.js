import { findOrder } from '@/lib/asana';

export async function GET(request) {
  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) return Response.json({ ok: false, reason: 'no_ref' }, { status: 400 });

  try {
    return Response.json(await findOrder(ref));
  } catch (e) {
    return Response.json({ ok: false, reason: 'error', error: e.message }, { status: 500 });
  }
}