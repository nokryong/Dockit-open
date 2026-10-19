const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateManifest } = require('../../plugin-sdk/manifest.cjs');

const manifest = { manifestVersion: 1, sdkVersion: 2, id: 'test.calendar', name: '달력', version: '0.2.0', publisher: 'Test', icon: 'react-icons/tb/TbCalendar', permissions: ['storage'], widgets: [{ id: 'calendar', title: '달력', entry: 'index.html' }] };
test('manifest localization is bounded and preserves stable IDs and permissions', () => {
  const value = { ...manifest, locales: { en: { name: 'Calendar', description: 'Events', widgets: { calendar: 'Calendar' } } } };
  assert.deepEqual(validateManifest(value).locales, value.locales);
  assert.equal(validateManifest(value).id, manifest.id);
  assert.deepEqual(validateManifest(value).permissions, manifest.permissions);
  for (const locales of [{ en: { widgets: { other: 'Invalid' } } }, { en: { name: '' } }, { en: { description: 'x'.repeat(501) } }, { en: { widgets: { calendar: 42 } } }, { en: { permissions: ['network'] } }, { invalid_locale: {} }]) {
    assert.throws(() => validateManifest({ ...manifest, locales }), { code: 'PluginError' });
  }
  assert.equal(validateManifest(manifest).locales, undefined);
});

test('browser bridge accepts language only from its parent and keeps old hosts Korean', async () => {
  const listeners = new Map();
  const parent = { postMessage() {} };
  const documentElement = { lang: '', style: { setProperty() {} } };
  const window = { parent, addEventListener: (name, callback) => listeners.set(name, callback) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../plugin-sdk/browser.js'), 'utf8'), { window, document: { documentElement }, setTimeout, clearTimeout });
  const post = (data, source = parent) => listeners.get('message')({ source, data: { channel: 'dockit-plugin-v1', ...data } });
  const changes = [];
  const unsubscribe = window.Dockit.onLanguageChange(value => changes.push(value));
  post({ type: 'init', theme: { fontFamily: 'Pretendard' } });
  await window.Dockit.ready;
  assert.equal(window.Dockit.language, 'ko');
  post({ type: 'language', language: 'en' }, {});
  assert.equal(window.Dockit.language, 'ko');
  post({ type: 'language', language: 'en' });
  assert.equal(window.Dockit.language, 'en');
  assert.equal(documentElement.lang, 'en');
  post({ type: 'theme', theme: { fontFamily: 'Other' } });
  assert.equal(window.Dockit.language, 'en');
  post({ type: 'language', language: 'en' });
  assert.deepEqual(changes, ['en']);
  unsubscribe();
  post({ type: 'language', language: 'fr' });
  assert.equal(window.Dockit.language, 'ko');
  assert.deepEqual(changes, ['en']);
});
