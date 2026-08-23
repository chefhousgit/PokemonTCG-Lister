import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export default function SettingsView() {
  const [paths, setPaths] = useState([]);
  const [envFallback, setEnvFallback] = useState(null);
  const [label, setLabel] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    const data = await api.paths();
    setPaths(data.paths || []);
    setEnvFallback(data.envFallback);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

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

  async function remove(id) {
    await api.deletePath(id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 space-y-3">
        <h2 className="section-heading">PTCGPB folder on this computer</h2>
        <p className="text-sm text-text-secondary">
          Paste the folder that contains <span className="font-display">PTCGPB.ahk</span> — for example
          <span className="font-display text-text-primary"> C:\Users\User\Desktop\PTCGPB-main</span>.
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
              placeholder="C:\Users\User\Desktop\PTCGPB-main"
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
        <p className="text-xs text-text-muted">Scan a saved folder from the Import tab. If this app is on Railway, upload the account JSON files instead — the server cannot see your C:\ drive.</p>
      </section>
    </div>
  );
}
