async function request(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
  const res = await fetch(path, { credentials: 'include', ...options, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res;
}

export const api = {
  health: () => request('/api/health'),
  meta: () => request('/api/meta'),
  inventory: (q) => request(`/api/inventory${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  accounts: () => request('/api/accounts'),
  listings: () => request('/api/listings'),
  bulkListings: (cardIds) => request('/api/listings/bulk', { method: 'POST', body: JSON.stringify({ cardIds }) }),
  publishListing: (id) => request(`/api/listings/${id}/publish`, { method: 'POST', body: JSON.stringify({}) }),
  publishAllDrafts: () => request('/api/listings/publish-all-drafts', { method: 'POST', body: JSON.stringify({}) }),
  orders: () => request('/api/orders'),
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: JSON.stringify(payload) }),
  jobs: () => request('/api/jobs'),
  job: (id) => request(`/api/jobs/${id}`),
  jobRouting: (id) => request(`/api/jobs/${id}/routing`),
  jobAction: (id, action, payload = {}) => request(`/api/jobs/${id}/${action}`, { method: 'POST', body: JSON.stringify(payload) }),
  paths: () => request('/api/settings/paths'),
  savePath: (payload) => request('/api/settings/paths', { method: 'POST', body: JSON.stringify(payload) }),
  deletePath: (id) => request(`/api/settings/paths/${id}`, { method: 'DELETE' }),
  scanPath: (payload) => request('/api/imports/scan', { method: 'POST', body: JSON.stringify(payload) }),
  commitImport: (previewId) => request('/api/imports/commit', { method: 'POST', body: JSON.stringify({ previewId }) }),
  previewUpload: (files) => {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    return request('/api/imports/preview', { method: 'POST', body });
  },
  draftListing: (cardId) => request('/api/claude/draft-listing', { method: 'POST', body: JSON.stringify({ cardId }) }),
};
