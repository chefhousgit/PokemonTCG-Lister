import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export default function ImportView() {
  const [paths, setPaths] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.paths().then((d) => setPaths(d.paths || [])).catch((err) => setError(err.message));
  }, []);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      setPreview(await fn());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function summarize(diff) {
    if (!diff) return null;
    return `${diff.adds?.length || 0} add · ${diff.updates?.length || 0} update · ${diff.skips?.length || 0} skip · ${diff.retires?.length || 0} retire`;
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 space-y-3">
        <h2 className="section-heading">Upload account JSON</h2>
        <p className="text-sm text-text-secondary">Works from any computer. Select files from Accounts\Cards\accounts — never Saved XML.</p>
        <input
          type="file"
          multiple
          accept=".json"
          className="field-input"
          onChange={(e) => run(() => api.previewUpload(e.target.files))}
        />
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="section-heading">Scan a saved folder</h2>
        {paths.length === 0 && <p className="text-sm text-text-muted">Add a folder path under Settings first.</p>}
        {paths.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            className="btn-secondary w-full text-left normal-case tracking-normal"
            onClick={() => run(() => api.scanPath({ pathId: p.id }))}
          >
            Scan {p.label}
            <span className="block text-[11px] text-text-muted font-body">{p.folder_path}</span>
          </button>
        ))}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      {preview?.committed && (
        <p className="text-sm text-accent">Import committed.</p>
      )}
      {preview && !preview.committed && preview.diff && (
        <section className="card p-4 space-y-3">
          <h2 className="section-heading">Diff preview #{preview.id}</h2>
          <p className="text-sm text-text-primary">{summarize(preview.diff)}</p>
          {preview.diff.skips?.length > 0 && (
            <pre className="text-xs text-warn whitespace-pre-wrap">{JSON.stringify(preview.diff.skips, null, 2)}</pre>
          )}
          <button type="button" disabled={busy} className="btn-primary w-full" onClick={() => run(async () => {
            const result = await api.commitImport(preview.id);
            return { committed: true, result };
          })}>
            Commit import
          </button>
        </section>
      )}
    </div>
  );
}
