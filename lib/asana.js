const BASE = 'https://app.asana.com/api/1.0';
const WORKSPACE = '1201752736261902';

const ARTIST_PROJECTS = {
  '1201752736475523': 'Widy',
  '1203034869458706': 'Lohith',
  '1203044135579018': 'Jamir',
  '1201752736587145': 'Rahmadani',
  '1201752736475561': 'Dias',
  '1201752736587153': 'Andhika',
  '1203383841720036': 'Fadhil',
};

async function asana(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.errors?.map((e) => e.message).join('; ') || res.status);
  }
  return json.data;
}

// "#14319" -> "14319" ; "FL 14319" -> "FL14319" ; "@13389 Redraw" -> "13389"
export function normalizeRef(input) {
  if (!input) return null;
  const s = String(input).trim();
  const anchored = s.match(/^[#@]?\s*([A-Za-z]{0,3})\s*(\d{4,6})(?!\d)/);
  if (anchored) return (anchored[1] || '').toUpperCase() + anchored[2];
  const anywhere = s.match(/(?<!\d)(\d{4,6})(?!\d)/); // legacy "Baby Truck + Custom BG #3980"
  return anywhere ? anywhere[1] : null;
}

let cache = { at: 0, tasks: [] };

async function openTasks() {
  if (Date.now() - cache.at < 60_000) return cache.tasks;
  const tasks = [];
  for (const [gid, name] of Object.entries(ARTIST_PROJECTS)) {
    const rows = await asana(
      `/tasks?project=${gid}&completed_since=now&opt_fields=name,completed&limit=100`
    );
    rows.forEach((t) => tasks.push({ ...t, project: name }));
  }
  cache = { at: Date.now(), tasks };
  return tasks;
}

export async function findOrder(input) {
  const ref = normalizeRef(input);
  if (!ref) return { ok: false, reason: 'unrecognized' };

  // Tier 1 — open tasks (covers nearly everything, ~38 rows)
  const open = (await openTasks()).filter((t) => normalizeRef(t.name) === ref);
  if (open.length === 1) {
    return { ok: true, ref, task: open[0], completed: false };
  }
  if (open.length > 1) {
    return { ok: false, reason: 'ambiguous', ref, matches: open };
  }

  // Tier 2 — search, for revisions on already-completed orders
  try {
    const found = await asana(
      `/workspaces/${WORKSPACE}/tasks/search?text=${encodeURIComponent(ref)}` +
        `&opt_fields=name,completed,projects.name&limit=20`
    );
    const hits = found.filter((t) => normalizeRef(t.name) === ref);
    if (hits.length) {
      const t = hits[0];
      return {
        ok: true,
        ref,
        task: { ...t, project: t.projects?.[0]?.name || 'unknown' },
        completed: !!t.completed,
      };
    }
  } catch (e) {
    return { ok: false, reason: 'search_failed', ref, error: e.message };
  }

  return { ok: false, reason: 'not_found', ref };
}
const sectionCache = new Map();

async function needsRevisionSection(projectGid) {
  if (sectionCache.has(projectGid)) return sectionCache.get(projectGid);
  const sections = await asana(
    `/projects/${projectGid}/sections?opt_fields=name&limit=100`
  );
  const found = sections.find((s) => /needs\s*revision/i.test(s.name || ''));
  const gid = found ? found.gid : null;
  sectionCache.set(projectGid, gid);
  return gid;
}

export async function markNeedsRevision(taskGid, projectName) {
  try {
    const entry = Object.entries(ARTIST_PROJECTS).find(([, n]) => n === projectName);
    if (!entry) return { ok: false, reason: 'unknown_project', projectName };

    const sectionGid = await needsRevisionSection(entry[0]);
    if (!sectionGid) return { ok: false, reason: 'no_section', projectName };

    const res = await fetch(`${BASE}/sections/${sectionGid}/addTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ASANA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { task: taskGid } }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, reason: 'move_failed', detail: JSON.stringify(j.errors || res.status) };
    }
    return { ok: true, sectionGid };
  } catch (e) {
    return { ok: false, reason: 'error', detail: e.message };
  }
}