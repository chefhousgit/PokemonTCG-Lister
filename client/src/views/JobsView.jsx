import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

const COLUMNS = ['queued', 'routed', 'claimed', 'friend_pending', 'in_progress', 'awaiting_confirmation', 'needs_human', 'completed', 'failed'];

export default function JobsView() {
  const [jobs, setJobs] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [routing, setRouting] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    const data = await api.jobs();
    setJobs(data.jobs || []);
    setChecklist(data.checklist || []);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  async function openJob(id) {
    setSelected(id);
    const data = await api.job(id);
    setDetail(data);
    try {
      setRouting(await api.jobRouting(id));
    } catch {
      setRouting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 border-signal/40 bg-signal/5">
        <p className="text-sm text-signal">
          Botting and selling accounts or in-game items can violate Pokémon TCG Pocket terms and risk bans. Use the manual checklist. This app does not drive the emulator.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto flex gap-3 pb-2">
        {COLUMNS.map((status) => {
          const col = jobs.filter((j) => j.status === status);
          return (
            <section key={status} className="min-w-[220px] card p-3">
              <h2 className="section-heading mb-2">{status.replace(/_/g, ' ')} ({col.length})</h2>
              <ul className="space-y-2">
                {col.map((j) => (
                  <li key={j.id}>
                    <button type="button" className="w-full text-left text-sm cursor-pointer hover:text-accent" onClick={() => openJob(j.id)}>
                      #{j.id} {j.card_name}
                      <span className="block text-xs text-text-muted">{j.account_label || 'unrouted'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {detail && (
        <section className="card p-4 space-y-3">
          <h2 className="font-display">Job #{detail.job.id}</h2>
          <p className="text-sm text-text-secondary">{detail.job.card_name} from {detail.job.account_label}</p>
          <ol className="list-decimal pl-5 text-sm space-y-1">
            {checklist.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => api.jobAction(detail.job.id, 'complete').then(refresh)}>Complete</button>
            <button type="button" className="btn-secondary" onClick={() => api.jobAction(detail.job.id, 'retry').then(refresh)}>Retry</button>
            <button type="button" className="btn-ghost" onClick={() => api.jobAction(detail.job.id, 'needs-human').then(refresh)}>Needs human</button>
            <button type="button" className="btn-danger" onClick={() => api.jobAction(detail.job.id, 'fail').then(refresh)}>Force fail</button>
          </div>
          <h3 className="section-heading">Timeline</h3>
          <ul className="space-y-1 text-xs">
            {detail.events.map((e) => (
              <li key={e.id} className="text-text-secondary">
                {e.ts} · {e.actor} · {e.type}
              </li>
            ))}
          </ul>
          {routing && (
            <div>
              <h3 className="section-heading mb-2">Routing candidates</h3>
              <ul className="space-y-1 text-xs">
                {routing.ranked.map((r) => (
                  <li key={r.account_id} className={r.eligible ? 'text-accent' : 'text-text-muted'}>
                    {r.label}: {r.eligible ? 'eligible' : r.reasons.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
