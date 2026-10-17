const { PluginStore } = require('./plugin-store.cjs');
const { pluginProtocol } = require('./plugin-protocol.cjs');
const { randomUUID } = require('node:crypto');
const { inspectGitHubPlugins, downloadGitHubPlugin } = require('./plugin-github.cjs');
const { PluginServices } = require('./plugin-services.cjs');
const { PluginUpdates, sourceFor } = require('./plugin-updates.cjs');

async function registerPluginHost({ root, handle, protocol, shell, getWindow, broadcast, encryption, dialog, downloads, clipboard, nativeImage }) {
  const plugins = new PluginStore({ root, trash: file => shell.trashItem(file) });
  await plugins.init();
  const services = new PluginServices({ store: plugins, encryption, dialog, shell, getWindow, downloads, clipboard, nativeImage });
  const updates = new PluginUpdates({ store: plugins });
  const changed = () => broadcast ? broadcast('plugins:changed', plugins.list()) : getWindow()?.webContents.send('plugins:changed', plugins.list());
  const owners = new Map();
  const owned = sessionId => { if (owners.get(sessionId) !== getWindow()?.webContents.id) throw new Error('이 창의 플러그인만 접근할 수 있습니다.'); };
  plugins.closeWindow = windowId => {
    for (const [sessionId, owner] of owners) if (owner === windowId) { plugins.close(sessionId); owners.delete(sessionId); }
  };
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
    const installed = await plugins.installBytes(await downloadGitHubPlugin(preview.snapshot, folder), sourceFor(preview.snapshot, folder));
    previews.delete(token);
    changed();
    return installed;
  });
  handle('plugins:check-updates', () => updates.check());
  handle('plugins:update', async id => {
    const installed = await updates.update(id);
    changed();
    return installed;
  });
  handle('plugins:uninstall', async (id, keepData) => {
    try { return await plugins.uninstall(id, keepData); }
    finally { changed(); }
  });
  handle('plugins:open', async (id, widgetId) => {
    const opened = await plugins.open(id, widgetId);
    owners.set(opened.sessionId, getWindow().webContents.id);
    return opened;
  });
  handle('plugins:close', sessionId => { owned(sessionId); plugins.close(sessionId); owners.delete(sessionId); });
  handle('plugins:storage', (sessionId, operation, key, value) => { owned(sessionId); return plugins.storage(sessionId, operation, key, value); });
  handle('plugins:request', (sessionId, method, payload) => { owned(sessionId); return services.request(sessionId, method, payload); });
  protocol.handle('dockit-plugin', pluginProtocol(plugins));
  return plugins;
}

module.exports = { registerPluginHost };
