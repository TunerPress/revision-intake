import { parseRevision } from '@/lib/agent';

export async function POST(request) {
  const { text } = await request.json();
  try {
    return Response.json({ ok: true, parsed: await parseRevision(text) });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}