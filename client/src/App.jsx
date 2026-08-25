import React, { useCallback, useEffect, useState } from 'react';
import { api } from './utils/api.js';
import InventoryView from './views/InventoryView.jsx';
import ComposerView from './views/ComposerView.jsx';
import AccountsView from './views/AccountsView.jsx';
import JobsView from './views/JobsView.jsx';
import ImportView from './views/ImportView.jsx';
import SettingsView from './views/SettingsView.jsx';

const NAV = [
  ['inventory', 'Cards'],
  ['composer', 'Listings'],
  ['accounts', 'Accounts'],
  ['jobs', 'Jobs'],
  ['import', 'Import'],
  ['settings', 'Settings'],
];

const TITLES = {
  inventory: 'CARD DATABASE',
  composer: 'LISTINGS',
  accounts: 'ACCOUNTS',
  jobs: 'TRADE JOBS',
  import: 'IMPORT',
  settings: 'SETTINGS',
};

function hashView() {
  const raw = window.location.hash.replace('#/', '').replace('#', '');
  return NAV.some(([id]) => id === raw) ? raw : 'inventory';
}

export default function App() {
  const [view, setView] = useState(hashView);
  const [health, setHealth] = useState(null);
  const [meta, setMeta] = useState(null);

  const navigate = useCallback((next) => {
    window.history.pushState({ view: next }, '', `#/${next}`);
    setView(next);
  }, []);

  useEffect(() => {
    function onPop() {
      setView(hashView());
    }
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    if (!window.location.hash) window.history.replaceState({ view }, '', `#/${view}`);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, [view]);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'down' }));
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, []);

  const fullBleed = view === 'inventory';
  const wide = view === 'jobs' || view === 'composer';

  return (
    <div className={`flex flex-col h-full mx-auto bg-surface-900 ${fullBleed ? 'max-w-none' : wide ? 'max-w-6xl border-x border-surface-700/50' : 'max-w-2xl border-x border-surface-700/50'}`}>
      <header className="shrink-0 border-b border-surface-700/50">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-display font-bold tracking-wide text-text-primary">{TITLES[view]}</h1>
            <p className="text-[11px] font-display tracking-[0.2em] text-text-muted">POCKET LISTER</p>
          </div>
          <a href="/auth/logout" className="text-xs font-display uppercase tracking-wider text-text-muted hover:text-accent">Logout</a>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-t border-surface-700/30 text-xs font-display">
          <span className={health?.status === 'ok' ? 'text-accent' : 'text-danger'}>● Server</span>
          <span className="text-text-muted">Adapter {meta?.marketplace || '—'}</span>
          <span className="text-text-muted">Exec {meta?.executor || '—'}</span>
        </div>
        <nav className="flex overflow-x-auto gap-1 px-2 pb-2">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={`min-h-touch px-3 rounded-lg text-xs font-display uppercase tracking-wider cursor-pointer ${
                view === id ? 'bg-accent text-surface-950' : 'text-text-secondary hover:bg-surface-800'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className={fullBleed ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 overflow-y-auto p-4'}>
        <div className={view === 'inventory' ? 'h-full' : 'hidden'}>
          <InventoryView />
        </div>
        <div className={view === 'composer' ? '' : 'hidden'}>
          <ComposerView />
        </div>
        <div className={view === 'accounts' ? '' : 'hidden'}>
          <AccountsView />
        </div>
        <div className={view === 'jobs' ? '' : 'hidden'}>
          <JobsView />
        </div>
        <div className={view === 'import' ? '' : 'hidden'}>
          <ImportView active={view === 'import'} />
        </div>
        <div className={view === 'settings' ? '' : 'hidden'}>
          <SettingsView />
        </div>
      </main>
    </div>
  );
}
