const { PluginStore } = require('./plugin-store.cjs');
const { pluginProtocol } = require('./plugin-protocol.cjs');
const { randomUUID } = require('node:crypto');
const { inspectGitHubPlugins, downloadGitHubPlugin } = require('./plugin-github.cjs');

async function registerPluginHost({ root, handle, protocol, shell, getWindow }) {
  const plugins = new PluginStore({ root, trash: file => shell.trashItem(file) });
  await plugins.init();
  const changed = () => getWindow()?.webContents.send('plugins:changed', plugins.list());
  handle('plugins:list', () => plugins.list());
  const previews = new Map();
  handle('plugins:inspect', async url => {
    const snapshot = await inspectGitHubPlugins(url);
    while (previews.size >= 8) previews.delete(previews.keys().next().value);
    const token = randomUUID();
    previews.set(token, { snapshot, expires: Date.now() + 10 * 60 * 1000 });
    return { token, plugins: snapshot.plugins.map(({ id, name, publisher, version, path }) => ({ id, name, publisher, version, path })) };
  });
  handle('plugins:install', async (token, folder) => {
    const preview = previews.get(token);
    if (!preview || preview.expires < Date.now()) throw new Error('플러그인 주소를 다시 확인해주세요.');
    const installed = await plugins.installBytes(await downloadGitHubPlugin(preview.snapshot, folder));
    previews.delete(token);
    changed();
    return installed;
  });
  handle('plugins:uninstall', async (id, keepData) => {
    try { return await plugins.uninstall(id, keepData); }
    finally { changed(); }
  });
  handle('plugins:open', (id, widgetId) => plugins.open(id, widgetId));
  handle('plugins:close', sessionId => plugins.close(sessionId));
  handle('plugins:storage', (sessionId, operation, key, value) => plugins.storage(sessionId, operation, key, value));
  protocol.handle('dockit-plugin', pluginProtocol(plugins));
  return plugins;
}

module.exports = { registerPluginHost };
