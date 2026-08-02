#!/usr/bin/env node
/**
 * Phase 0b — order-number matching check for revision-intake.
 *
 * Fully read-only. Creates and deletes nothing.
 *
 * Confirms that normalizing task names (strip "#", trim) actually captures
 * the order tasks, reports collisions, and shows what is left over.
 *
 * Run:  ASANA_TOKEN=... node phase0b.js
 * Output: console + phase0b-findings.md
 */
 
const TOKEN = process.env.ASANA_TOKEN;
const WORKSPACE_MATCH = 'tunerarts';
const BASE = 'https://app.asana.com/api/1.0';
 
// Artist projects only — the cross-functional plan is excluded by name.
const SKIP_PROJECT_NAMES = [/cross-functional/i];
 
if (!TOKEN) {
  console.error('ASANA_TOKEN is not set.  Run:  ASANA_TOKEN=your_token node phase0b.js');
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
 
/** Candidate matching rules, loosest last. */
const RULES = [
  { name: 'A. exact 5 digits            ', test: (n) => /^\d{5}$/.test(n.trim()) },
  { name: 'B. optional # + 5 digits     ', test: (n) => /^#?\s*\d{5}$/.test(n.trim()) },
  {
    name: 'C. starts with # or digits   ',
    test: (n) => /^#?\s*\d{5}\b/.test(n.trim()),
  },
  {
    name: 'D. contains a 5-digit number ',
    test: (n) => /(?<!\d)\d{5}(?!\d)/.test(n),
  },
];
 
/** The rule we intend to ship: leading optional #, exactly 5 digits, ignore trailing text. */
const normalize = (name) => {
  const m = (name || '').trim().match(/^#?\s*(\d{5})(?!\d)/);
  return m ? m[1] : null;
};
 
async function main() {
  note('# Phase 0b findings — order-number matching');
  note(`\nRun: ${new Date().toISOString()}`);
 
  const workspaces = await api('/workspaces');
  const ws = workspaces.find((w) =>
    w.name.toLowerCase().includes(WORKSPACE_MATCH)
  );
  note(`\nWorkspace: ${ws.name} (${ws.gid})`);
 
  const projects = (await apiAll(`/projects?workspace=${ws.gid}&archived=false`))
    .filter((p) => !SKIP_PROJECT_NAMES.some((re) => re.test(p.name)));
 
  const all = []; // {project, name, gid, completed}
  for (const p of projects) {
    const tasks = await apiAll(`/tasks?project=${p.gid}&opt_fields=name,completed`);
    tasks.forEach((t) =>
      all.push({ project: p.name, name: t.name || '', gid: t.gid, completed: t.completed })
    );
    note(`- read ${p.name}: ${tasks.length} tasks`);
  }
  note(`\nTotal tasks across artist projects: ${all.length}`);
 
  // ---- how much does each rule capture? --------------------------------
  note('\n## 1. Coverage by matching rule');
  for (const rule of RULES) {
    const hits = all.filter((t) => rule.test(t.name)).length;
    const pct = ((hits / all.length) * 100).toFixed(1);
    note(`- ${rule.name} ${String(hits).padStart(5)} tasks  (${pct}%)`);
  }
 
  // ---- the shipping rule ------------------------------------------------
  note('\n## 2. Proposed rule: optional "#", 5 digits, trailing text allowed');
  const index = new Map(); // order -> [{project,gid,completed,name}]
  let unmatched = [];
  for (const t of all) {
    const order = normalize(t.name);
    if (!order) {
      unmatched.push(t);
      continue;
    }
    if (!index.has(order)) index.set(order, []);
    index.get(order).push(t);
  }
  note(`- matched tasks: ${all.length - unmatched.length}`);
  note(`- distinct order numbers: ${index.size}`);
  note(`- unmatched tasks: ${unmatched.length}`);
 
  // ---- collisions -------------------------------------------------------
  note('\n## 3. Collisions after normalization');
  const dupes = [...index.entries()].filter(([, v]) => v.length > 1);
  const openDupes = dupes.filter(([, v]) => v.filter((t) => !t.completed).length > 1);
  note(`- order numbers on more than one task: ${dupes.length}`);
  note(`- ...with MORE THAN ONE incomplete task (unresolvable): ${openDupes.length}`);
  openDupes.slice(0, 15).forEach(([num, v]) =>
    note(
      `  - ${num}: ${v
        .filter((t) => !t.completed)
        .map((t) => `${t.project} "${t.name}"`)
        .join('  ||  ')}`
    )
  );
  dupes
    .filter(([, v]) => v.filter((t) => !t.completed).length <= 1)
    .slice(0, 8)
    .forEach(([num, v]) =>
      note(
        `  - resolvable ${num}: ${v
          .map((t) => `${t.project}${t.completed ? ' (done)' : ' (open)'}`)
          .join(' | ')}`
      )
    );
 
  // ---- open vs completed ------------------------------------------------
  note('\n## 4. Open vs completed');
  const openOrders = [...index.entries()].filter(([, v]) =>
    v.some((t) => !t.completed)
  );
  note(`- order numbers with at least one open task: ${openOrders.length}`);
  note(`- order numbers where every task is completed: ${index.size - openOrders.length}`);
 
  // ---- what did not match ----------------------------------------------
  note('\n## 5. Unmatched task names (sample of 40)');
  const seen = new Set();
  unmatched
    .filter((t) => {
      const k = t.name.replace(/\d/g, '#').slice(0, 40);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 40)
    .forEach((t) => note(`  - [${t.project}] "${t.name}"`));
 
  // ---- do any unmatched names hide an order number? --------------------
  note('\n## 6. Unmatched names that still contain a 5-digit number');
  const hidden = unmatched.filter((t) => /(?<!\d)\d{5}(?!\d)/.test(t.name));
  note(`- count: ${hidden.length}`);
  hidden.slice(0, 20).forEach((t) => note(`  - [${t.project}] "${t.name}"`));
 
  // ---- range check for the reserved block ------------------------------
  note('\n## 7. Order number range');
  const nums = [...index.keys()].map(Number).sort((a, b) => a - b);
  if (nums.length) {
    note(`- lowest: ${nums[0]}`);
    note(`- highest: ${nums[nums.length - 1]}`);
    note(
      `- suggests reserving a non-Shopify block well above ${nums[nums.length - 1]}`
    );
  }
 
  require('fs').writeFileSync('phase0b-findings.md', findings.join('\n') + '\n');
  console.log('\n---\nWritten to phase0b-findings.md');
}
 
main().catch((e) => {
  note(`\nFATAL: ${e.message}`);
  require('fs').writeFileSync('phase0b-findings.md', findings.join('\n') + '\n');
  process.exit(1);
});
 