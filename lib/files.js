import { getFile, removeFile } from './storage';
import { attachToTask } from './attach';

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;

async function record(row) {
  try {
    await fetch(`${URL_}/rest/v1/submission_files`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row),
    });
  } catch {
    // bookkeeping only
  }
}

export async function attachFiles(submissionId, taskGid, files) {
  const results = [];

  for (const f of files || []) {
    const row = {
      submission_id: submissionId,
      storage_path: f.path,
      file_name: f.name,
      content_type: f.type,
      size_bytes: f.size,
    };

    try {
      const buf = await getFile(f.path);
      const att = await attachToTask(taskGid, buf, f.name, f.type);
      row.asana_attachment_gid = att.gid;
      row.deleted_from_storage_at = new Date().toISOString();
      await record(row);
      await removeFile(f.path);
      results.push({ name: f.name, ok: true });
    } catch (e) {
      await record(row);
      results.push({ name: f.name, ok: false, error: e.message });
    }
  }

  return results;
}