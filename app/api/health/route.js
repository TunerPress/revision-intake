const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;

function describe(name, v) {
  if (!v) return { name, present: false };
  return {
    name,
    present: true,
    length: v.length,
    prefix: v.slice(0, 12),
    hasWhitespace: /\s/.test(v),
    hasQuotes: /^['"]|['"]$/.test(v),
  };
}

export async function GET() {
  const out = { env: [], checks: [] };

  out.env.push(describe('ASANA_TOKEN', process.env.ASANA_TOKEN));
  out.env.push(describe('SUPABASE_URL', URL_));
  out.env.push(describe('SUPABASE_SECRET_KEY', KEY));

  // Supabase, apikey header only
  try {
    const r = await fetch(`${URL_}/rest/v1/submissions?select=id&limit=1`, {
      headers: { apikey: KEY },
    });
    out.checks.push({ check: 'supabase_apikey_only', status: r.status, body: (await r.text()).slice(0, 200) });
  } catch (e) {
    out.checks.push({ check: 'supabase_apikey_only', error: e.message });
  }

  // Supabase, apikey + bearer
  try {
    const r = await fetch(`${URL_}/rest/v1/submissions?select=id&limit=1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    out.checks.push({ check: 'supabase_with_bearer', status: r.status, body: (await r.text()).slice(0, 200) });
  } catch (e) {
    out.checks.push({ check: 'supabase_with_bearer', error: e.message });
  }

  // Storage bucket
  try {
    const r = await fetch(`${URL_}/storage/v1/bucket`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    out.checks.push({ check: 'storage_buckets', status: r.status, body: (await r.text()).slice(0, 200) });
  } catch (e) {
    out.checks.push({ check: 'storage_buckets', error: e.message });
  }

  // Asana
  try {
    const r = await fetch('https://app.asana.com/api/1.0/users/me', {
      headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` },
    });
    out.checks.push({ check: 'asana', status: r.status, ok: r.ok });
  } catch (e) {
    out.checks.push({ check: 'asana', error: e.message });
  }

  return Response.json(out);
}