import { putFile } from '@/lib/storage';

const MAX_FILES = 5;
const MAX_BYTES = 25 * 1024 * 1024;
const OK_EXT = /\.(pdf|jpg|jpeg|png|gif|webp|heic|svg|eps|ai|psd|tif|tiff)$/i;

export async function POST(request) {
  const form = await request.formData();
  const files = form.getAll('files').filter((f) => typeof f === 'object');

  if (!files.length) return Response.json({ ok: true, files: [] });
  if (files.length > MAX_FILES) {
    return Response.json({ ok: false, error: 'too_many' }, { status: 400 });
  }

  const out = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return Response.json({ ok: false, error: 'too_big', name: f.name }, { status: 400 });
    }
    if (!OK_EXT.test(f.name || '')) {
      return Response.json({ ok: false, error: 'bad_type', name: f.name }, { status: 400 });
    }

    const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
    const path = `${crypto.randomUUID()}/${safe}`;
    const buf = Buffer.from(await f.arrayBuffer());

    try {
      await putFile(path, buf, f.type);
      out.push({ path, name: safe, type: f.type, size: f.size });
    } catch (e) {
      return Response.json({ ok: false, error: 'upload_failed', detail: e.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, files: out });
}