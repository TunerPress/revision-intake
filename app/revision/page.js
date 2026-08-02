'use client';

import { useState } from 'react';

const FIELD =
  'mt-2 w-full rounded-lg border border-neutral-400 px-4 py-3 text-lg focus:border-neutral-900 focus:outline-none';
const LABEL = 'block text-lg font-medium text-neutral-900';

export default function RevisionForm() {
  const [f, setF] = useState({ orderRef: '', name: '', email: '', text: '' });
  const [lookup, setLookup] = useState(null);
  const [busy, setBusy] = useState(false);
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
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
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