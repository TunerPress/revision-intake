const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = 'revision_uploads';

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export async function putFile(path, buffer, contentType) {
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': contentType || 'application/octet-stream' },
    body: buffer,
  });
  if (!res.ok) throw new Error(`upload failed: ${(await res.text()).slice(0, 200)}`);
  return path;
}

export async function getFile(path) {
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    headers: auth,
  });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function removeFile(path) {
  try {
    await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'DELETE',
      headers: auth,
    });
  } catch {
    // storage cleanup is best-effort
  }
}