const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

export async function insertSubmission(row) {
  const res = await fetch(`${URL_}/rest/v1/submissions`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body[0];
}

export async function updateSubmission(id, patch) {
  try {
    await fetch(`${URL_}/rest/v1/submissions?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patch),
    });
  } catch {
    // never let a logging failure break the customer's submission
  }
}