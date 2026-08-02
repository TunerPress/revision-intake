const BASE = 'https://app.asana.com/api/1.0';

export async function attachToTask(taskGid, buffer, fileName, contentType) {
  const form = new FormData();
  form.append('parent', taskGid);
  form.append(
    'file',
    new Blob([buffer], { type: contentType || 'application/octet-stream' }),
    fileName
  );

  const res = await fetch(`${BASE}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` },
    body: form,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.errors || res.status));
  return json.data;
}