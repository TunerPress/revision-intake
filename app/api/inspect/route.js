import { findOrder } from '@/lib/asana';

export async function GET(request) {
  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) return Response.json({ error: 'add ?ref=14319' }, { status: 400 });

  const match = await findOrder(ref);
  if (!match.ok) return Response.json(match);

  const res = await fetch(
    `https://app.asana.com/api/1.0/tasks/${match.task.gid}` +
      `?opt_fields=name,completed,memberships.section.name,memberships.project.name,` +
      `custom_fields.name,custom_fields.type,custom_fields.enum_value.name,` +
      `custom_fields.display_value,custom_fields.enum_options.name,custom_fields.enum_options.gid`,
    { headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` }, cache: 'no-store' }
  );
  const json = await res.json();
  if (!res.ok) return Response.json(json, { status: res.status });

  const t = json.data;
  return Response.json({
    task: t.name,
    gid: t.gid,
    sections: (t.memberships || []).map((m) => ({
      project: m.project?.name,
      section: m.section?.name,
    })),
    fields: (t.custom_fields || []).map((c) => ({
      gid: c.gid,
      name: c.name,
      type: c.type,
      current: c.display_value,
      options: (c.enum_options || []).map((o) => `${o.name} (${o.gid})`),
    })),
  });
}