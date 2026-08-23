import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export default function AccountsView() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.accounts().then((d) => setAccounts(d.accounts || [])).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      {accounts.map((a) => (
        <article key={a.id} className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm">{a.label}</h2>
            <span className={a.health === 'active' ? 'status-ok' : 'status-warn'}>{a.health}</span>
          </div>
          <p className="text-xs text-text-muted break-all">{a.external_key}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-text-muted text-xs">Instance</dt><dd>{a.emulator_instance || '—'}</dd></div>
            <div><dt className="text-text-muted text-xs">Friend slots</dt><dd>{a.friend_slots_used}/{a.friend_slots_total} ({a.friend_slots_free} free)</dd></div>
            <div><dt className="text-text-muted text-xs">Trade currency</dt><dd>{a.trade_currency}</dd></div>
            <div><dt className="text-text-muted text-xs">Jobs in flight</dt><dd>{a.jobs_in_flight}</dd></div>
            <div className="col-span-2"><dt className="text-text-muted text-xs">Last heartbeat</dt><dd>{a.last_heartbeat_at || '—'}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
