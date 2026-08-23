const fs = require('fs');
const path = require('path');
const ManualExecutor = require('./manual');
const StubExecutor = require('./stub');

function loadPlugin(pluginPath) {
  if (!pluginPath) return null;
  const resolved = path.resolve(pluginPath);
  if (!fs.existsSync(resolved)) return null;
  // Plugin is outside this repo. It must export { createExecutor }.
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const mod = require(resolved);
  if (typeof mod.createExecutor === 'function') return mod.createExecutor();
  if (typeof mod === 'function') return mod();
  return mod;
}

function getTradeExecutor(name) {
  const plugin = loadPlugin(process.env.TRADE_EXECUTOR_PLUGIN);
  if (plugin) return plugin;
  const key = (name || process.env.TRADE_EXECUTOR || 'manual').toLowerCase();
  if (key === 'stub') return new StubExecutor();
  return new ManualExecutor();
}

module.exports = { getTradeExecutor, loadPlugin };
