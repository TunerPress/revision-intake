export async function GET() {
  const res = await fetch(
    'https://app.asana.com/api/1.0/projects?workspace=1201752736261902&archived=false&opt_fields=name&limit=100',
    { headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` }, cache: 'no-store' }
  );
  const json = await res.json();
  if (!res.ok) return Response.json(json, { status: res.status });

  const hits = json.data.filter((p) => /customer\s*service/i.test(p.name));
  return Response.json(hits.map((p) => `${p.name} (${p.gid})`));
}