const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DocumentWindows, filesFromArguments } = require('../../electron/document-windows.cjs');

const window = id => Object.assign(new EventEmitter(), { webContents: { id, send: (_channel, request) => { window.requests.push({ id, request }); } }, isDestroyed: () => false });
window.requests = [];
test('save barrier requires every window and rejects unrelated acknowledgements', async () => {
  const windows = new DocumentWindows(), one = window(1), two = window(2), other = window(3);
  windows.add(one, 'a'); windows.add(two, 'b');
  assert.equal(windows.find('a'), one);
  const saving = windows.save();
  const id = window.requests.at(-1).request;
  let done = false; saving.then(() => { done = true; });
  windows.saved(other, id, { ok: true }); windows.saved(one, id, { ok: true });
  await Promise.resolve(); assert.equal(done, false);
  windows.saved(two, id, { ok: true }); await saving; assert.equal(done, true);
  const failed = windows.save();
  windows.saved(one, window.requests.at(-1).request, { ok: false, message: 'save failed' });
  await assert.rejects(failed, /save failed/);
});
test('native arguments select dkt files without interpreting flags as paths', () => {
  assert.equal(filesFromArguments(['electron', '--dev', 'one.dkt', '--flag.dkt']).length, 1);
});

test('in-app navigation keeps the window and updates its document scope', () => {
  const windows = new DocumentWindows(), current = window(11);
  windows.add(current);
  windows.navigate(current, 'dockit://app/index.html#/docs/doc-a');
  assert.equal(windows.find('doc-a'), current);
  windows.navigate(current, 'dockit://app/index.html#/docs/doc-b');
  assert.equal(windows.find('doc-a'), undefined);
  assert.equal(windows.context(current).documentId, 'doc-b');
  windows.navigate(current, 'dockit://app/index.html#/docs?folder=one');
  assert.equal(windows.context(current).documentId, null);
  assert.equal(windows.all().length, 1);
});
