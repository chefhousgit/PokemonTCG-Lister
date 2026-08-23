import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export default function ComposerView() {
  const [listings, setListings] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sale, setSale] = useState({ listingId: '', buyerHandle: '', buyerFriendId: '' });

  async function refresh() {
    const data = await api.listings();
    setListings(data.listings || []);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" className="btn-primary" onClick={async () => {
          try {
            const result = await api.publishAllDrafts();
            setMessage(`Published ${result.published.length} via ${result.adapter}`);
            await refresh();
          } catch (err) { setError(err.message); }
        }}>Publish drafts</button>
        <a className="btn-secondary text-center" href="/api/export/listings.csv">CSV</a>
        <a className="btn-secondary text-center" href="/api/export/listings.xlsx">XLSX</a>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-accent">{message}</p>}

      <ul className="space-y-2">
        {listings.map((l) => (
          <li key={l.id} className="card p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm">{l.title}</p>
              <span className={l.status === 'published' ? 'status-ok' : 'status-warn'}>{l.status}</span>
            </div>
            <p className="text-xs text-text-muted">{l.name} · sellable shown in inventory, never publish from total</p>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{l.description}</p>
            {l.status === 'draft' && (
              <button type="button" className="btn-secondary" onClick={async () => {
                await api.publishListing(l.id);
                await refresh();
              }}>Publish</button>
            )}
          </li>
        ))}
      </ul>

      <section className="card p-4 space-y-3">
        <h2 className="section-heading">Enter a sale</h2>
        <label className="field-label" htmlFor="listingId">Listing id</label>
        <select id="listingId" className="field-input" value={sale.listingId} onChange={(e) => setSale({ ...sale, listingId: e.target.value })}>
          <option value="">Select listing</option>
          {listings.filter((l) => l.status === 'published' || l.status === 'draft').map((l) => (
            <option key={l.id} value={l.id}>{l.id} — {l.title}</option>
          ))}
        </select>
        <input className="field-input" placeholder="Buyer handle" value={sale.buyerHandle} onChange={(e) => setSale({ ...sale, buyerHandle: e.target.value })} />
        <input className="field-input" placeholder="Buyer friend ID" value={sale.buyerFriendId} onChange={(e) => setSale({ ...sale, buyerFriendId: e.target.value })} />
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!sale.listingId}
          onClick={async () => {
            setError('');
            try {
              const result = await api.createOrder({
                listingId: Number(sale.listingId),
                buyerHandle: sale.buyerHandle,
                buyerFriendId: sale.buyerFriendId,
              });
              setMessage(`Order ${result.order.id} → job ${result.job.id} on ${result.routing.pick[0]?.label}`);
            } catch (err) { setError(err.message); }
          }}
        >
          Create order + route job
        </button>
      </section>
    </div>
  );
}
