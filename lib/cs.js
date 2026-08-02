const BASE = 'https://app.asana.com/api/1.0';
const CS_PROJECT = '1217092295334135';

async function createTask(name, notes) {
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ASANA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { projects: [CS_PROJECT], name, notes } }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.errors || res.status));
  return json.data;
}

function context(sub) {
  const L = [];
  if (sub.customerName) L.push(`Customer: ${sub.customerName}`);
  if (sub.email) L.push(`Email: ${sub.email}`);
  if (sub.taskName) L.push(`Asana task: ${sub.taskName} (${sub.project})`);
  L.push('', 'CUSTOMER WROTE:', '', sub.rawText);
  return L.join('\n');
}

export async function createCsTasks(sub) {
  const label = sub.ref || sub.rawRef || 'No order number';
  const made = [];

  for (const item of sub.parsed?.cs_items || []) {
    const t = await createTask(`${label} - ${item}`, context(sub));
    made.push(t.gid);
  }

  if (!sub.matched) {
    const t = await createTask(
      `${label} - order not found, needs matching`,
      context(sub)
    );
    made.push(t.gid);
  } else if (sub.completed) {
    const t = await createTask(
      `${label} - revision on a completed order, check whether to charge`,
      context(sub)
    );
    made.push(t.gid);
  }

  return made;
}