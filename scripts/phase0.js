#!/usr/bin/env node
/**
 * Phase 0 — Asana capability spike for revision-intake.
 *
 * Read-only against your real data. The only writes are one temporary task
 * created in the workspace with NO project (so no artist sees it), plus a
 * subtask and a small text attachment on it. All of it is deleted at the end.
 *
 * Run:  ASANA_TOKEN=... node phase0.js
 * Output: console summary + phase0-findings.md
 */
 
const TOKEN = process.env.ASANA_TOKEN;
const WORKSPACE_MATCH = 'tunerarts';
const BASE = 'https://app.asana.com/api/1.0';
 
if (!TOKEN) {
  console.error('ASANA_TOKEN is not set.  Run:  ASANA_TOKEN=your_token node phase0.js');
  process.exit(1);
}
 
const findings = [];
function note(line) {
  findings.push(line);
  console.log(line);
}
 
async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers || {}),
    },
  });
  const retryAfter = res.headers.get('retry-after');
  if (res.status === 429) {
    throw new Error(`Rate limited. Retry-After: ${retryAfter}`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const msg = json?.errors?.map((e) => e.message).join('; ') || text.slice(0, 300);
    throw new Error(`${res.status} ${path} — ${msg}`);
  }
  return json.data;
}
 
/** Follow Asana's offset pagination to the end. */
async function apiAll(path, limit = 100) {
  const out = [];
  let offset = null;
  for (let page = 0; page < 100; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${path}${sep}limit=${limit}${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(`${BASE}${url}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.status === 429) throw new Error('Rate limited during pagination.');
    const json = await res.json();
    if (!res.ok) {
      const msg = json?.errors?.map((e) => e.message).join('; ') || res.status;
      throw new Error(`${url} — ${msg}`);
    }
    out.push(...json.data);
    offset = json.next_page?.offset;
    if (!offset) break;
  }
  return out;
}
 
const isOrderNumber = (name) => /^\d{5}$/.test((name || '').trim());
 
async function main() {
  note('# Phase 0 findings — revision-intake');
  note(`\nRun: ${new Date().toISOString()}`);
 
  // ---- 1. Identity + workspace ------------------------------------------
  note('\n## 1. Token and workspace');
  const me = await api('/users/me');
  note(`- Authenticated as: ${me.name}`);
 
  const workspaces = await api('/workspaces');
  note(`- Workspaces visible: ${workspaces.map((w) => w.name).join(', ')}`);
 
  const ws = workspaces.find((w) =>
    w.name.toLowerCase().includes(WORKSPACE_MATCH)
  );
  if (!ws) {
    note(`- FAIL: no workspace matching "${WORKSPACE_MATCH}". Stopping.`);
    return finish();
  }
  note(`- Target workspace: ${ws.name}  (gid ${ws.gid})`);
 
  // ---- 2. Projects ------------------------------------------------------
  note('\n## 2. Projects');
  const projects = await apiAll(`/projects?workspace=${ws.gid}&archived=false`);
  note(`- Active projects: ${projects.length}`);
 
  // ---- 3. Which projects hold 5-digit order tasks? ----------------------
  note('\n## 3. Order-number tasks by project');
  const orderMap = new Map(); // order number -> [{project, gid, completed}]
  const projectRows = [];
 
  for (const p of projects) {
    let tasks;
    try {
      tasks = await apiAll(
        `/tasks?project=${p.gid}&opt_fields=name,completed`
      );
    } catch (e) {
      note(`- ${p.name}: could not read tasks (${e.message})`);
      continue;
    }
    const orders = tasks.filter((t) => isOrderNumber(t.name));
    projectRows.push({ project: p, total: tasks.length, orders: orders.length });
 
    for (const t of orders) {
      if (!orderMap.has(t.name.trim())) orderMap.set(t.name.trim(), []);
      orderMap.get(t.name.trim()).push({
        project: p.name,
        gid: t.gid,
        completed: t.completed,
      });
    }
  }
 
  projectRows
    .sort((a, b) => b.orders - a.orders)
    .forEach((r) =>
      note(
        `- ${r.project.name} (gid ${r.project.gid}) — ${r.total} tasks, ${r.orders} with 5-digit names`
      )
    );
 
  note(`\n- Distinct order numbers found: ${orderMap.size}`);
 
  // ---- 4. Duplicate order numbers --------------------------------------
  note('\n## 4. Duplicate order numbers');
  const dupes = [...orderMap.entries()].filter(([, v]) => v.length > 1);
  note(`- Order numbers appearing more than once: ${dupes.length}`);
  const badDupes = dupes.filter(
    ([, v]) => v.filter((t) => !t.completed).length > 1
  );
  note(`- ...of which have MORE THAN ONE incomplete task: ${badDupes.length}`);
  if (badDupes.length) {
    note('  These cannot be resolved automatically and would route to CS:');
    badDupes
      .slice(0, 10)
      .forEach(([num, v]) =>
        note(`  - ${num}: ${v.map((t) => t.project).join(' + ')}`)
      );
  }
  dupes.slice(0, 5).forEach(([num, v]) => {
    note(
      `  - sample ${num}: ${v
        .map((t) => `${t.project}${t.completed ? ' (done)' : ''}`)
        .join(' | ')}`
    );
  });
 
  // ---- 5. Non-order task names (what else lives in these projects) ------
  note('\n## 5. Task-name sanity check');
  const sampleProject = projectRows.sort((a, b) => b.orders - a.orders)[0];
  if (sampleProject) {
    const sample = await apiAll(
      `/tasks?project=${sampleProject.project.gid}&opt_fields=name,completed`
    );
    const nonOrders = sample.filter((t) => !isOrderNumber(t.name)).slice(0, 8);
    note(
      `- In "${sampleProject.project.name}", ${nonOrders.length ? 'examples of' : 'no'} task names that are NOT plain 5-digit numbers:`
    );
    nonOrders.forEach((t) => note(`  - "${t.name}"`));
  }
 
  // ---- 6. Inspect one real task ----------------------------------------
  note('\n## 6. Structure of one real order task');
  const firstOrder = [...orderMap.entries()].find(([, v]) => !v[0].completed);
  if (firstOrder) {
    const t = await api(
      `/tasks/${firstOrder[1][0].gid}?opt_fields=name,completed,notes,num_subtasks,custom_fields.name,assignee.name,projects.name`
    );
    note(`- Task ${t.name} (gid ${t.gid})`);
    note(`  - assignee: ${t.assignee?.name || 'none'}`);
    note(`  - projects: ${(t.projects || []).map((p) => p.name).join(', ')}`);
    note(`  - existing subtasks: ${t.num_subtasks}`);
    note(
      `  - custom fields: ${(t.custom_fields || []).map((c) => c.name).join(', ') || 'none'}`
    );
    const subs = await api(`/tasks/${t.gid}/subtasks?opt_fields=name`);
    subs.slice(0, 5).forEach((s) => note(`  - subtask: "${s.name}"`));
  } else {
    note('- No incomplete order task found to inspect.');
  }
 
  // ---- 7. Write test (temporary, no project, deleted after) ------------
  note('\n## 7. Write capability test');
  let tempTask, subtask;
  try {
    tempTask = await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          workspace: ws.gid,
          name: 'ZZ phase0 temp — safe to ignore',
          notes: 'Created by the Phase 0 spike. Deleted automatically.',
        },
      }),
    });
    note(`- Create task: OK (gid ${tempTask.gid}, no project, not visible to artists)`);
 
    subtask = await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          parent: tempTask.gid,
          name: 'Revision request — phase0 test',
          notes:
            'CHANGES\n\n1. First change\n2. Second change\n\nREFERENCE\n- test\n',
        },
      }),
    });
    note('- Create subtask with multi-line notes: OK');
 
    // ---- attachment ----
    try {
      const form = new FormData();
      form.append('parent', subtask.gid);
      form.append(
        'file',
        new Blob([Buffer.from('phase0 attachment test')], { type: 'text/plain' }),
        'phase0-test.txt'
      );
      const att = await api('/attachments', { method: 'POST', body: form });
      note(`- Upload attachment to SUBTASK: OK (gid ${att.gid})`);
      note('  >>> Attachments work on this plan. Phase 5 is unblocked.');
    } catch (e) {
      note(`- Upload attachment: FAILED — ${e.message}`);
      note('  >>> Tell Claude. This changes the plan.');
    }
  } catch (e) {
    note(`- Write test FAILED — ${e.message}`);
  } finally {
    if (tempTask) {
      try {
        await api(`/tasks/${tempTask.gid}`, { method: 'DELETE' });
        note('- Cleanup: temp task and subtask deleted');
      } catch (e) {
        note(`- Cleanup FAILED — delete task ${tempTask.gid} by hand. ${e.message}`);
      }
    }
  }
 
  // ---- 8. Search endpoint (expected to fail on Starter) ----------------
  note('\n## 8. Premium search endpoint');
  try {
    await api(
      `/workspaces/${ws.gid}/tasks/search?text=12345&limit=1&opt_fields=name`
    );
    note('- Search endpoint: available (nice, but the plan does not need it)');
  } catch (e) {
    note(`- Search endpoint: not available — ${e.message}`);
    note('  >>> Expected on Starter. The Supabase index approach handles this.');
  }
 
  finish();
}
 
function finish() {
  const fs = require('fs');
  fs.writeFileSync('phase0-findings.md', findings.join('\n') + '\n');
  console.log('\n---\nWritten to phase0-findings.md — paste that file back to Claude.');
}
 
main().catch((e) => {
  note(`\nFATAL: ${e.message}`);
  finish();
  process.exit(1);
});
 