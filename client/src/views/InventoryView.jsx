import React, { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api.js';

function ageLabel(ageMs) {
  if (ageMs == null) return '';
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function InventoryView() {
  const [live, setLive] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState('');
  const [frameKey, setFrameKey] = useState(0);
  const liveRef = useRef(null);
  liveRef.current = live;

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const meta = await api.meta();
        if (!cancelled) setLive(meta.liveDashboard || null);
      } catch {
        if (!cancelled) setLive(null);
      }
    }
    refresh();
    const timer = setInterval(refresh, pulling ? 2000 : 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pulling]);

  async function pullNow() {
    if (pulling) return;
    setPulling(true);
    setPullError('');
    const beforeAt = liveRef.current && liveRef.current.at;
    try {
      await api.requestLivePull();
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        await sleep(1500);
        const meta = await api.meta();
        const next = meta.liveDashboard || null;
        setLive(next);
        const arrived = next && next.live && next.at && next.at !== beforeAt;
        const firstLive = !beforeAt && next && next.live;
        if (arrived || firstLive) {
          setFrameKey((n) => n + 1);
          return;
        }
      }
      setPullError('Agent did not refresh in time. Is it running on the PTCGPB PC?');
    } catch (err) {
      setPullError(err.message || 'Pull failed');
    } finally {
      setPulling(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-surface-700/50 text-xs font-display flex flex-wrap items-center gap-x-3 gap-y-2">
        {live && live.live ? (
          <span className="text-accent">Live from PTCGPB · {ageLabel(live.ageMs)} · {live.accountCount || 0} accounts</span>
        ) : (
          <span className="text-warn">
            Using imported accounts. Run the local agent on the PTCGPB PC with the card dashboard open for live data.
          </span>
        )}
        <button
          type="button"
          onClick={pullNow}
          disabled={pulling}
          className="ml-auto min-h-[32px] px-3 rounded-lg border border-surface-700 bg-surface-800 text-[11px] font-display uppercase tracking-wider text-accent hover:border-accent/40 disabled:opacity-40"
        >
          {pulling ? 'Pulling…' : 'Pull now'}
        </button>
        {pullError ? <span className="w-full text-danger">{pullError}</span> : null}
      </div>
      <iframe
        key={frameKey}
        title="PTCGPB card dashboard"
        src="/dashboard"
        className="w-full flex-1 min-h-0 border-0 bg-[#0b1020]"
      />
    </div>
  );
}
