#!/usr/bin/env node
/**
 * Phase 0c — how common are named (non-numeric) orders lately?
 *
 * Fully read-only. Creates and deletes nothing.
 *
 * Answers: is the 61% named-order share a historical artifact, or is it
 * still true for recent and currently-open work?
 *
 * Run:  ASANA_TOKEN=... node phase0c.js
 * Output: console + phase0c-findings.md
 */
 
const TOKEN = process.env.ASANA_TOKEN;
const WORKSPACE_MATCH = 'tunerarts';
const BASE = 'https://app.asana.com/api/1.0';
const SKIP_PROJECT_NAMES = [/cross-functional/i];
 
if (!TOKEN) {
  console.error('ASANA_TOKEN is not set.');
  process.exit(1);
}
 
const findings = [];
const note = (l) => {
  findings.push(l);
  console.log(l);
};
 
async function apiAll(path, limit = 100) {
  const out = [];
  let offset = null;
  for (let page = 0; page < 200; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${sep}limit=${limit}${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 30);
      note(`  (rate limited, waiting ${wait}s)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`${url} — ${JSON.stringify(json.errors)}`);
    out.push(...json.data);
    offset = json.next_page?.offset;
    if (!offset) break;
  }
  return out;
}
 
async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} — ${JSON.stringify(json.errors)}`);
  return json.data;
}
 
/**
 * Widened rule: optional # or @ prefix, 4 to 6 digits, trailing text allowed.
 * Covers legacy 4-digit orders and the "@13389 Redraw" case.
 */
const orderNumber = (name) => {
  const m = (name || '').trim().match(/^[#@]?\s*(\d{4,6})(?!\d)/);
  return m ? m[1] : null;
};
 
const monthKey = (iso) => (iso || '').slice(0, 7);
 
async function main() {
  note('# Phase 0c findings — named vs numbered orders over time');
  note(`\nRun: ${new Date().toISOString()}`);
 
  const workspaces = await api('/workspaces');
  const ws = workspaces.find((w) => w.name.toLowerCase().includes(WORKSPACE_MATCH));
  const projects = (await apiAll(`/projects?workspace=${ws.gid}&archived=false`))
    .filter((p) => !SKIP_PROJECT_NAMES.some((re) => re.test(p.name)));
 
  const all = [];
  for (const p of projects) {
    const tasks = await apiAll(
      `/tasks?project=${p.gid}&opt_fields=name,completed,created_at`
    );
    tasks.forEach((t) => all.push({ ...t, project: p.name }));
    note(`- read ${p.name}: ${tasks.length}`);
  }
  note(`\nTotal: ${all.length}`);
 
  // ---- 1. widened rule vs the previous one ------------------------------
  note('\n## 1. Widened rule (optional #/@, 4-6 digits)');
  const prev = all.filter((t) => /^#?\s*\d{5}(?!\d)/.test((t.name || '').trim())).length;
  const now = all.filter((t) => orderNumber(t.name)).length;
  note(`- previous rule (# + exactly 5 digits): ${prev}`);
  note(`- widened rule (#/@ + 4-6 digits):      ${now}`);
  note(`- additional tasks captured:            ${now - prev}`);
 
  // ---- 2. by month ------------------------------------------------------
  note('\n## 2. Mix by month created (last 18 months)');
  const byMonth = new Map();
  for (const t of all) {
    const k = monthKey(t.created_at);
    if (!k) continue;
    if (!byMonth.has(k)) byMonth.set(k, { numbered: 0, named: 0 });
    byMonth.get(k)[orderNumber(t.name) ? 'numbered' : 'named']++;
  }
  const months = [...byMonth.keys()].sort().slice(-18);
  note('  month     numbered   named   % numbered');
  for (const m of months) {
    const { numbered, named } = byMonth.get(m);
    const total = numbered + named;
    const pct = total ? ((numbered / total) * 100).toFixed(0) : '0';
    note(
      `  ${m}   ${String(numbered).padStart(6)}  ${String(named).padStart(6)}   ${String(pct).padStart(5)}%`
    );
  }
 
  // ---- 3. last 90 days --------------------------------------------------
  note('\n## 3. Last 90 days');
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const recent = all.filter((t) => (t.created_at || '') >= cutoff);
  const rNum = recent.filter((t) => orderNumber(t.name)).length;
  note(`- tasks created: ${recent.length}`);
  note(`- numbered: ${rNum}   named: ${recent.length - rNum}`);
  note(
    `- % numbered: ${recent.length ? ((rNum / recent.length) * 100).toFixed(1) : 'n/a'}%`
  );
 
  // ---- 4. currently open work (the live picture) -----------------------
  note('\n## 4. Currently OPEN tasks — this is what the form must handle');
  const open = all.filter((t) => !t.completed);
  const oNum = open.filter((t) => orderNumber(t.name));
  note(`- open tasks: ${open.length}`);
  note(`- numbered: ${oNum.length}   named: ${open.length - oNum.length}`);
  note(
    `- % numbered: ${open.length ? ((oNum.length / open.length) * 100).toFixed(1) : 'n/a'}%`
  );
  note('\n- open NAMED tasks (up to 40):');
  open
    .filter((t) => !orderNumber(t.name))
    .slice(0, 40)
    .forEach((t) => note(`  - [${t.project}] "${t.name}"`));
 
  // ---- 5. how many distinct named-order "series" are there? ------------
  note('\n## 5. Named-order series (prefix before trailing digits)');
  const series = new Map();
  all
    .filter((t) => !orderNumber(t.name))
    .forEach((t) => {
      const base = (t.name || '')
        .replace(/^[#@]\s*/, '')
        .replace(/^order\s+/i, '')
        .replace(/\s*\d+\s*$/, '')
        .replace(/\s*-\s*(prioritize|urgent).*$/i, '')
        .trim();
      if (!base) return;
      series.set(base, (series.get(base) || 0) + 1);
    });
  const top = [...series.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  note(`- distinct series: ${series.size}`);
  top.forEach(([name, n]) => note(`  - ${String(n).padStart(4)}  ${name}`));
 
  require('fs').writeFileSync('phase0c-findings.md', findings.join('\n') + '\n');
  console.log('\n---\nWritten to phase0c-findings.md');
}
 
main().catch((e) => {
  note(`\nFATAL: ${e.message}`);
  require('fs').writeFileSync('phase0c-findings.md', findings.join('\n') + '\n');
  process.exit(1);
});