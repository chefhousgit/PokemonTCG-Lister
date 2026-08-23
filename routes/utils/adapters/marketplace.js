const MockAdapter = require('./mock');
const ManualExportAdapter = require('./manualExport');
const EldoradoAdapter = require('./eldorado.stub');

function getMarketplaceAdapter(name) {
  const key = (name || process.env.MARKETPLACE_ADAPTER || 'manual').toLowerCase();
  if (key === 'mock') return new MockAdapter();
  if (key === 'eldorado') return new EldoradoAdapter();
  return new ManualExportAdapter();
}

module.exports = { getMarketplaceAdapter };
