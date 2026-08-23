import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export default function InventoryView({ onCompose }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const [selected, setSelected] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(query) {
    const data = await api.inventory(query);
    setRows(data.rows || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([id]) => Number(id));

  async function createDrafts() {
    setError('');
    setMessage('');
    try {
      const result = await api.bulkListings(selectedIds);
      setMessage(`${result.created.length} drafts created. ${result.refused.length} refused.`);
      if (onCompose) onCompose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="field-input"
          placeholder="Filter name / set / id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(q).catch((err) => setError(err.message)); }}
        />
        <button type="button" className="btn-secondary" onClick={() => load(q)}>Filter</button>
        <button type="button" className="btn-primary" disabled={!selectedIds.length} onClick={createDrafts}>
          Draft {selectedIds.length || ''}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-accent">{message}</p>}

      <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[11px] font-display uppercase tracking-wider text-text-muted">
        <div className="col-span-1">Sel</div>
        <div className="col-span-5">Card</div>
        <div className="col-span-2">Total</div>
        <div className="col-span-2">Sellable</div>
        <div className="col-span-2">Accounts</div>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.card.id} className="card p-3">
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2 md:col-span-1">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#00d4aa] cursor-pointer"
                  checked={Boolean(selected[row.card.id])}
                  onChange={(e) => setSelected((s) => ({ ...s, [row.card.id]: e.target.checked }))}
                  aria-label={`Select ${row.card.name}`}
                />
              </div>
              <button
                type="button"
                className="col-span-10 md:col-span-5 text-left cursor-pointer"
                onClick={() => setOpen((o) => ({ ...o, [row.card.id]: !o[row.card.id] }))}
              >
                <p className="font-display text-sm">{row.card.name}</p>
                <p className="text-xs text-text-muted">{row.card.set_code} #{row.card.number} · {row.card.rarity}</p>
              </button>
              <div className="col-span-4 md:col-span-2 text-sm">{row.total}</div>
              <div className="col-span-4 md:col-span-2 text-sm text-accent">{row.sellable}</div>
              <div className="col-span-4 md:col-span-2 text-sm text-text-secondary">{row.perAccount.length}</div>
            </div>
            {open[row.card.id] && (
              <ul className="mt-3 space-y-1 border-t border-surface-700 pt-2">
                {row.perAccount.map((acc) => (
                  <li key={acc.account_id} className="text-xs flex justify-between text-text-secondary">
                    <span>{acc.label} ({acc.health})</span>
                    <span>qty {acc.qty} · reserved {acc.reserved_qty} · sellable {acc.sellable}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
