const assert = require('node:assert/strict');
const path = require('node:path');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit', timeout: 30000 });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else {
  const { app, clipboard, ClipboardItem, nativeImage } = require('electron');
  const { writeClipboardImage } = require('../electron/image-clipboard.cjs');
  const { PluginServices } = require('../electron/plugin-services.cjs');
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    assert.equal(typeof clipboard.write, 'function');
    const source = nativeImage.createFromPath(path.join(__dirname, '../public/logo/symbol-square.png'));
    let writes = 0;
    // Use the runtime's ClipboardItem and decoder without replacing the user's clipboard.
    const sink = { write: async items => {
      assert.equal(items.length, 1);
      assert.ok(items[0] instanceof ClipboardItem);
      const png = await items[0].getType('image/png');
      const decoded = nativeImage.createFromBuffer(Buffer.from(await png.arrayBuffer()));
      assert.deepEqual(decoded.getSize(), source.getSize());
      assert.deepEqual(decoded.toBitmap(), source.toBitmap());
      writes++;
    } };
    await writeClipboardImage({ clipboard: sink, ClipboardItem }, source);
    const services = new PluginServices({ clipboard: sink, ClipboardItem, nativeImage,
      store: { session: () => ({ manifest: { permissions: ['images'] } }) } });
    assert.equal(await services.request('fixture', 'images.copy', { dataUrl: source.toDataURL() }), true);
    assert.equal(writes, 2);
    console.log(`PASS: Electron ${process.versions.electron} clipboard API, native PNG payload and plugin copy`);
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
