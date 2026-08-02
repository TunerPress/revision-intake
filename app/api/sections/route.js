const PROJECTS = {
  Widy: '1201752736475523',
  Lohith: '1203034869458706',
  Jamir: '1203044135579018',
  Rahmadani: '1201752736587145',
  Dias: '1201752736475561',
  Andhika: '1201752736587153',
  Fadhil: '1203383841720036',
};

export async function GET() {
  const out = {};
  for (const [name, gid] of Object.entries(PROJECTS)) {
    const res = await fetch(
      `https://app.asana.com/api/1.0/projects/${gid}/sections?opt_fields=name&limit=100`,
      { headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` }, cache: 'no-store' }
    );
    const json = await res.json();
    out[name] = res.ok
      ? json.data.map((s) => `${s.name} (${s.gid})`)
      : { error: json.errors };
  }
  return Response.json(out);
}