async function request(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
  const res = await fetch(path, { credentials: 'include', ...options, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
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
  requestLivePull: () => request('/api/live/refresh', { method: 'POST', body: JSON.stringify({}) }),
  inventory: (q, { library = true } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (library) params.set('library', '1');
    const suffix = params.toString() ? `?${params}` : '';
    return request(`/api/inventory${suffix}`);
  },
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
  cardAlerts: () => request('/api/settings/card-alerts'),
  saveCardAlerts: (payload) => request('/api/settings/card-alerts', { method: 'PUT', body: JSON.stringify(payload) }),
  testCardAlert: (payload = {}) => request('/api/settings/card-alerts/test', { method: 'POST', body: JSON.stringify(payload) }),
  searchCatalog: (q) => request(`/api/settings/catalog?q=${encodeURIComponent(q)}`),
  scanPath: (payload) => request('/api/imports/scan', { method: 'POST', body: JSON.stringify(payload) }),
  latestImport: () => request('/api/imports/latest'),
  commitImport: (previewId, limit = 8) => request('/api/imports/commit', { method: 'POST', body: JSON.stringify({ previewId, limit }) }),
  previewUpload: (files, { fullSync = false } = {}) => {
    const body = new FormData();
    if (fullSync) body.append('fullSync', '1');
    for (const file of files) body.append('files', file);
    return request('/api/imports/preview', { method: 'POST', body });
  },
  draftListing: (cardId) => request('/api/claude/draft-listing', { method: 'POST', body: JSON.stringify({ cardId }) }),
};
