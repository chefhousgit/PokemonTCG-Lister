import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export default function SettingsView() {
  const [paths, setPaths] = useState([]);
  const [envFallback, setEnvFallback] = useState(null);
  const [label, setLabel] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [watched, setWatched] = useState([]);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertError, setAlertError] = useState('');
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);

  async function refresh() {
    const data = await api.paths();
    setPaths(data.paths || []);
    setEnvFallback(data.envFallback);
  }

  async function refreshAlerts() {
    const data = await api.cardAlerts();
    setWebhookUrl(data.webhookUrl || '');
    setWatched(data.cards || []);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
    refreshAlerts().catch((err) => setAlertError(err.message));
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setHits([]);
      return undefined;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      api.searchCatalog(q)
        .then((data) => setHits(data.cards || []))
        .catch((err) => setAlertError(err.message))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.savePath({
        label: label || (typeof navigator !== 'undefined' ? navigator.platform : 'Computer'),
        folder_path: folderPath,
      });
      setFolderPath('');
      setMessage('Saved. This path is remembered for this app — add one per computer.');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function persistAlerts(patch, { quiet } = {}) {
    setAlertError('');
    if (!quiet) setAlertMessage('');
    setSavingAlerts(true);
    try {
      const data = await api.saveCardAlerts(patch);
      if (Object.prototype.hasOwnProperty.call(patch, 'webhookUrl')) {
        setWebhookUrl(data.webhookUrl || '');
      }
      setWatched(data.cards || []);
      if (!quiet) {
        setAlertMessage(
          patch.webhookUrl
            ? 'Webhook saved. Watched cards ping this channel about once an hour when new copies appear.'
            : 'Watch list saved.',
        );
      }
      return data;
    } catch (err) {
      setAlertError(err.message);
      throw err;
    } finally {
      setSavingAlerts(false);
    }
  }

  async function addWatch(card) {
    const next = watched.some((row) => row.card_id === card.card_id) ? watched : [...watched, card];
    setWatched(next);
    setSearch('');
    setHits([]);
    try {
      await persistAlerts({ cardIds: next.map((row) => row.card_id) }, { quiet: true });
      setAlertMessage(`Watching ${card.name}.`);
    } catch {
      setWatched(watched);
    }
  }

  async function removeWatch(cardId) {
    const previous = watched;
    const next = watched.filter((row) => row.card_id !== cardId);
    setWatched(next);
    try {
      await persistAlerts({ cardIds: next.map((row) => row.card_id) }, { quiet: true });
    } catch {
      setWatched(previous);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 space-y-3">
        <h2 className="section-heading">PTCGPB folder on this computer</h2>
        <p className="text-sm text-text-secondary">
          Paste the folder that contains <span className="font-display">PTCGPB.ahk</span> — for example
          <span className="font-display text-text-primary"> C:\Users\Mahmoud\Desktop\PTCGPB-main</span>.
          Save a path per computer. The app never opens Accounts\Saved (passwords).
        </p>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="field-label" htmlFor="label">Computer label</label>
            <input id="label" className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Desktop PC" />
          </div>
          <div>
            <label className="field-label" htmlFor="folder">Folder path</label>
            <input
              id="folder"
              className="field-input"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="C:\Users\Mahmoud\Desktop\PTCGPB-main"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full">Save path</button>
        </form>
        {message && <p className="text-sm text-accent">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="section-heading">Saved folders</h2>
        {envFallback && (
          <p className="text-xs text-text-muted">Env fallback PTCGPB_ROOT: {envFallback}</p>
        )}
        {paths.length === 0 && <p className="text-sm text-text-muted">No saved paths yet.</p>}
        <ul className="space-y-2">
          {paths.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 border border-surface-700 rounded-lg p-3">
              <div>
                <p className="font-display text-sm text-text-primary">{p.label}</p>
                <p className="text-xs text-text-secondary break-all">{p.folder_path}</p>
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={() => remove(p.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-muted">
          A typed path is a label on Railway (the server cannot see C:\). For live Cards data, run <span className="font-display">node agent/index.js</span> on the PTCGPB PC and leave the card dashboard running. The agent only pings localhost and never opens Accounts\Saved.
        </p>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="section-heading">Discord card alerts</h2>
        <p className="text-sm text-text-secondary">
          Paste a webhook from your own Discord channel (Channel → Integrations → Webhooks → Copy Webhook URL). Clicking a search result saves it to the watch list immediately. After each hourly check, if a watched card was added in Cards, Lister posts that card with <span className="font-display">x3</span> (how many new copies). First save is a baseline — cards you already own do not ping.
        </p>
        <div>
          <label className="field-label" htmlFor="webhook">Discord webhook URL</label>
          <input
            id="webhook"
            className="field-input"
            type="text"
            autoComplete="off"
            spellCheck="false"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            onBlur={() => {
              if (!webhookUrl.trim()) return;
              persistAlerts({ webhookUrl }).catch(() => {});
            }}
            placeholder="https://discord.com/api/webhooks/…"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="card-search">Watch a card</label>
          <input
            id="card-search"
            className="field-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or PK_ id"
          />
          {searching && <p className="text-xs text-text-muted mt-1">Searching…</p>}
          {hits.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-auto space-y-1">
              {hits.map((card) => (
                <li key={card.card_id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-lg border border-surface-700 px-3 py-2 text-left hover:border-accent/40"
                    onClick={() => addWatch(card)}
                  >
                    {card.image_url ? (
                      <img src={card.image_url} alt="" className="w-8 h-11 object-cover rounded-sm" />
                    ) : (
                      <span className="w-8 h-11 rounded-sm bg-surface-700" />
                    )}
                    <span>
                      <span className="block text-sm text-text-primary">{card.name}</span>
                      <span className="block text-xs text-text-muted">{card.card_id}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {watched.length === 0 && <p className="text-sm text-text-muted">No watched cards yet.</p>}
        <ul className="space-y-2">
          {watched.map((card) => (
            <li key={card.card_id} className="flex items-center gap-3 border border-surface-700 rounded-lg p-3">
              {card.image_url ? (
                <img src={card.image_url} alt="" className="w-8 h-11 object-cover rounded-sm" />
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm text-text-primary">{card.name}</p>
                <p className="text-xs text-text-muted truncate">{card.card_id}</p>
              </div>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => removeWatch(card.card_id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={savingAlerts}
          onClick={() => {
            persistAlerts({
              webhookUrl,
              cardIds: watched.map((card) => card.card_id),
            }).catch(() => {});
          }}
        >
          {savingAlerts ? 'Saving…' : 'Save webhook'}
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          disabled={testingAlert || savingAlerts}
          onClick={async () => {
            setAlertError('');
            setAlertMessage('');
            setTestingAlert(true);
            try {
              await api.testCardAlert({ webhookUrl });
              setAlertMessage('Test sent. Check your Discord channel.');
            } catch (err) {
              setAlertError(err.message);
            } finally {
              setTestingAlert(false);
            }
          }}
        >
          {testingAlert ? 'Sending…' : 'Send live counts'}
        </button>
        {alertMessage && <p className="text-sm text-accent">{alertMessage}</p>}
        {alertError && <p className="text-sm text-danger">{alertError}</p>}
      </section>
    </div>
  );
}
