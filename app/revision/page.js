'use client';

import { useState } from 'react';

const FIELD =
  'mt-2 w-full rounded-lg border border-neutral-400 px-4 py-3 text-lg focus:border-neutral-900 focus:outline-none';
const LABEL = 'block text-lg font-medium text-neutral-900';

export default function RevisionForm() {
  const [f, setF] = useState({ orderRef: '', name: '', email: '', text: '' });
  const [lookup, setLookup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function checkOrder() {
    if (!f.orderRef.trim()) return setLookup(null);
    const res = await fetch(`/api/lookup?ref=${encodeURIComponent(f.orderRef)}`);
    setLookup(await res.json());
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      let uploaded = [];
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const upJson = await up.json();
        if (!upJson.ok) {
          setError('We could not upload one of those files. Try sending without photos.');
          setBusy(false);
          return;
        }
        uploaded = upJson.files;
      }
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, files: uploaded }),
      });
      const data = await res.json();
      data.ok ? setDone(data) : setError('We could not save that. Please call us.');
    } catch {
      setError('We could not save that. Please call us.');
    }
    setBusy(false);
  }

  if (done) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Got it</h1>
        <p className="mt-4 text-xl text-neutral-700">
          Your changes are with our team.
        </p>
        {done.task && <p className="mt-6 text-lg text-neutral-600">Order {done.task.name}</p>}
        <div className="mt-8 rounded-lg border border-neutral-300 bg-neutral-50 p-6">
          <p className="text-sm uppercase tracking-wide text-neutral-500">What you sent</p>
          <p className="mt-3 whitespace-pre-wrap text-lg">{f.text}</p>
        </div>
        <a
        href="https://www.tunercartoons.com" 
          className="mt-8 inline-block rounded-lg bg-neutral-900 px-8 py-4 text-lg
                     font-medium text-white hover:bg-neutral-800"
        >
          Return to Tuner Cartoons
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Request changes to your artwork</h1>
      <p className="mt-3 text-lg text-neutral-600">
        Tell us what you would like changed, in your own words.
      </p>

      <div className="mt-10 space-y-8">
        <div>
          <label className={LABEL}>Order number</label>
          <input value={f.orderRef} onChange={set('orderRef')} onBlur={checkOrder} placeholder="14319" className={FIELD} />
          {lookup?.ok && (
            <p className="mt-2 text-lg text-green-800">Found order {lookup.task.name}</p>
          )}
          {lookup && !lookup.ok && (
            <p className="mt-2 text-lg text-amber-800">
              We could not find that order number. You can still send your request.
            </p>
          )}
        </div>

        <div>
          <label className={LABEL}>Your name</label>
          <input value={f.name} onChange={set('name')} className={FIELD} />
        </div>

        <div>
          <label className={LABEL}>Your email</label>
          <input type="email" value={f.email} onChange={set('email')} className={FIELD} />
        </div>

        <div>
          <label className={LABEL}>What would you like changed?</label>
          <textarea rows={8} value={f.text} onChange={set('text')} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Photos or files (optional)</label>
          <p className="mt-1 text-neutral-600">
            Up to 5 files, 25 MB each. PDF, JPG, PNG, SVG, EPS or AI.
          </p>
          <label
            htmlFor="files"
            className="mt-3 inline-block cursor-pointer rounded-lg bg-blue-700 px-6 py-4
                       text-lg font-medium text-white hover:bg-blue-800"
          >
            Click to upload files from your computer or phone
          </label>
          <input
            id="files"
            type="file"
            multiple
            className="hidden"
            onChange={(e) =>
              setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 5))
            }
          />
          {files.length > 0 && (
            <ul className="mt-4 space-y-2">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-lg">
                  <span className="text-neutral-800">{f.name}</span>
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-blue-700 underline"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-lg text-red-700">{error}</p>}

        <button
          onClick={send}
          disabled={!f.text.trim() || busy}
          className="rounded-lg bg-neutral-900 px-8 py-4 text-lg font-medium text-white disabled:bg-neutral-400"
        >
          {busy ? 'Sending...' : 'Send my changes'}
        </button>
      </div>
    </main>
  );
}