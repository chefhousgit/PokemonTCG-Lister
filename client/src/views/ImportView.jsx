import React, { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api.js';
import {
  canRememberFolder,
  filterAccountJsons,
  filesFromRememberedFolder,
  folderPermission,
  loadRememberedFolder,
  pickAndRememberFolder,
} from '../utils/ptcgpbFolder.js';

function ProgressBar({ processed, total, label }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return (
    <div className="space-y-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Import progress'}>
      <div className="h-3 rounded-full bg-surface-700 overflow-hidden">
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs font-display text-text-secondary">
        {processed} / {total} · {pct}%
      </p>
    </div>
  );
}

function changeCount(diff) {
  if (!diff) return 0;
  return (diff.adds?.length || 0) + (diff.updates?.length || 0) + (diff.retires?.length || 0);
}

export default function ImportView({ active = true }) {
  const [paths, setPaths] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickedCount, setPickedCount] = useState(0);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [remembered, setRemembered] = useState(null);
  const didAutoCheck = useRef(false);

  useEffect(() => {
    if (!active || didAutoCheck.current) return;
    didAutoCheck.current = true;
    api.paths().then((d) => setPaths(d.paths || [])).catch((err) => setError(err.message));
    loadRememberedFolder().then(setRemembered).catch(() => {});
    api.latestImport().then(async (data) => {
      if (data && data.id && data.diff && (data.processed || 0) < (data.total || 0)) {
        setPreview(data);
        setProgress({ processed: data.processed || 0, total: data.total || 0 });
        setStatus(`Resumed preview #${data.id}. Confirm if you have not already.`);
        return;
      }
      if (data && data.id && data.diff) {
        setPreview(data);
        setStatus(`Last check is ready. Confirm only if something changed.`);
        return;
      }
      const stored = await loadRememberedFolder();
      if (!stored?.handle) return;
      const perm = await folderPermission(stored.handle);
      if (perm !== 'granted') return;
      await checkFiles(await filesFromRememberedFolder(stored.handle), { fullSync: true, pending: `Checking ${stored.name}…` });
    }).catch(() => {});
  }, [active]);

  async function checkFiles(files, { fullSync = false, pending } = {}) {
    const list = Array.from(files || []);
    setPickedCount(list.length);
    if (!list.length) {
      setError('No account JSON files found. Pick Accounts\\Cards\\accounts — not Accounts\\Saved.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus(pending || `Checking ${list.length} accounts against what is already imported…`);
    try {
      const next = await api.previewUpload(list, { fullSync });
      setPreview(next);
      const adds = next.diff?.adds?.length || 0;
      const updates = next.diff?.updates?.length || 0;
      const unchanged = next.diff?.unchanged?.length || 0;
      setStatus(`Checked ${next.checked || list.length} accounts: ${adds} new, ${updates} quantity change, ${unchanged} already imported.`);
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function rememberAndCheck() {
    setBusy(true);
    setError('');
    try {
      const handle = await pickAndRememberFolder();
      setRemembered({ handle, name: handle.name });
      await checkFiles(await filesFromRememberedFolder(handle), { fullSync: true, pending: `Checking ${handle.name}…` });
    } catch (err) {
      if (err && err.name === 'AbortError') setStatus('');
      else setError(err.message);
      setBusy(false);
    }
  }

  async function recheckRemembered() {
    if (!remembered?.handle) return;
    setBusy(true);
    setError('');
    try {
      const perm = await folderPermission(remembered.handle);
      if (perm !== 'granted') {
        setError('Allow folder access once, then this page can check the same accounts folder on its own.');
        setBusy(false);
        return;
      }
      await checkFiles(await filesFromRememberedFolder(remembered.handle), { fullSync: true, pending: `Checking ${remembered.name}…` });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview?.id) return;
    const pending = changeCount(preview.diff);
    setBusy(true);
    setError('');
    setStatus('Writing only new or changed accounts…');
    try {
      if (pending === 0) {
        setPreview({ committed: true, accounts: 0, items: 0 });
        setStatus('Already imported. Nothing to write.');
        return;
      }
      setProgress({ processed: 0, total: pending });
      let last = { processed: 0, total: pending, done: false };
      while (!last.done) {
        last = await api.commitImport(preview.id, 8);
        setProgress({ processed: last.processed, total: last.total || pending });
        setStatus(`Writing ${last.processed} of ${last.total} changed accounts…`);
      }
      setPreview({ committed: true, ...last });
      setStatus(`Import finished. ${last.accounts || 0} accounts written. Already-imported accounts were left as-is.`);
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  function onFolderPick(e) {
    checkFiles(filterAccountJsons(e.target.files), { fullSync: true, pending: 'Checking folder…' });
  }

  return (
    <div className="space-y-4">
      {(busy || status || progress.total > 0) && (
        <section className="card p-4 border-accent/40 space-y-3">
          <p className="font-display text-sm text-accent">{busy ? (status || 'Working… keep this tab open.') : status}</p>
          {progress.total > 0 && (
            <ProgressBar processed={progress.processed} total={progress.total} label="Commit progress" />
          )}
        </section>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="section-heading">Check accounts folder</h2>
        <p className="text-sm text-text-secondary">
          Already-imported accounts are matched by device id. A re-check does not create a second copy.
          Confirm only writes new accounts or quantity changes.
        </p>
        {remembered?.name && (
          <p className="text-xs text-text-muted">Remembered on this browser: {remembered.name}</p>
        )}
        {canRememberFolder() ? (
          <div className="flex flex-col gap-2">
            {remembered?.handle && (
              <button type="button" disabled={busy} className="btn-primary w-full" onClick={recheckRemembered}>
                {busy ? 'Checking…' : `Check ${remembered.name} again`}
              </button>
            )}
            <button type="button" disabled={busy} className={remembered?.handle ? 'btn-ghost w-full' : 'btn-primary w-full'} onClick={rememberAndCheck}>
              {remembered?.handle ? 'Choose a different folder' : 'Choose Accounts\\Cards\\accounts'}
            </button>
          </div>
        ) : (
          <label className="btn-primary w-full cursor-pointer">
            {busy ? 'Reading folder…' : 'Choose folder on this computer'}
            <input
              type="file"
              className="sr-only"
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={onFolderPick}
            />
          </label>
        )}
        {pickedCount > 0 && (
          <p className="text-xs text-text-muted">{pickedCount} JSON files checked</p>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="section-heading">Or pick account JSON files</h2>
        <p className="text-sm text-text-secondary">Use this for a few files. Already-imported accounts are still checked, not duplicated.</p>
        <input
          type="file"
          multiple
          accept=".json"
          className="field-input"
          onChange={(e) => checkFiles(e.target.files, { fullSync: false, pending: 'Checking files…' })}
        />
      </section>

      {paths.length > 0 && (
        <section className="card p-4 space-y-3">
          <h2 className="section-heading">Saved paths</h2>
          <p className="text-sm text-text-secondary">
            A typed path is a label on this hosted site. This browser can remember the folder you pick above and re-check it without creating duplicates.
          </p>
          {paths.map((p) => (
            <p key={p.id} className="text-xs text-text-muted break-all">
              {p.label}: {p.folder_path}
            </p>
          ))}
        </section>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {preview?.committed && (
        <section className="card p-4 space-y-2 border-accent/40">
          <p className="font-display text-accent">Import finished</p>
          <p className="text-sm text-text-primary">
            {preview.accounts || 0} accounts · {preview.items || 0} card rows written.
          </p>
          <p className="text-sm text-text-secondary">Open Inventory to see them. Re-check later to pick up new accounts or quantity changes only.</p>
        </section>
      )}

      {preview && !preview.committed && preview.diff && (
        <section className="card p-4 space-y-3">
          <h2 className="section-heading">Check result #{preview.id}</h2>
          <p className="text-sm text-text-primary">
            {preview.diff.adds?.length || 0} new · {preview.diff.updates?.length || 0} quantity change · {preview.diff.unchanged?.length || 0} already imported · {preview.diff.skips?.length || 0} skip · {preview.diff.retires?.length || 0} retire
          </p>
          {preview.diff.adds?.length > 0 && (
            <div>
              <p className="text-xs font-display text-accent mb-1">New accounts</p>
              <ul className="text-xs text-text-secondary space-y-1">
                {preview.diff.adds.slice(0, 20).map((row) => (
                  <li key={row.account.external_key}>+ {row.account.label} ({Object.keys(row.counts || {}).length} cards)</li>
                ))}
              </ul>
            </div>
          )}
          {preview.diff.updates?.length > 0 && (
            <div>
              <p className="text-xs font-display text-warn mb-1">Already imported — quantity changed</p>
              <ul className="text-xs text-text-secondary space-y-1">
                {preview.diff.updates.slice(0, 20).map((row) => (
                  <li key={row.previous.external_key}>~ {row.previous.label || row.next.account.label}</li>
                ))}
              </ul>
            </div>
          )}
          {preview.diff.unchanged?.length > 0 && (
            <p className="text-xs text-text-muted">
              {preview.diff.unchanged.length} account{preview.diff.unchanged.length === 1 ? '' : 's'} already imported with the same counts. They will not be written again.
            </p>
          )}
          {preview.diff.skips?.length > 0 && (
            <pre className="text-xs text-warn whitespace-pre-wrap">{JSON.stringify(preview.diff.skips, null, 2)}</pre>
          )}
          {changeCount(preview.diff) === 0 ? (
            <p className="text-sm text-accent">Nothing to confirm. These accounts are already in the app.</p>
          ) : (
            <button type="button" disabled={busy} className="btn-primary w-full" onClick={confirmImport}>
              {busy ? 'Writing…' : 'Confirm import'}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
