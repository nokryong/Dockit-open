const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { WindowsPrintService } = require('../../electron/windows-print.cjs');

async function fixture(t, events = [{ phase: 'completed', value: 'Canceled' }], status = 0) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-print-test-'));
  t.after(async () => {
    // The service removes its generated job files; only known empty folders remain.
    await fs.rmdir(path.join(root, 'print-cache')).catch(() => {});
    await fs.rmdir(root);
  });
  const state = { enabled: true, pdfOptions: null, request: null, args: null };
  const window = {
    webContents: { executeJavaScript: async () => {}, printToPDF: async options => { state.pdfOptions = options; return Buffer.from('%PDF-test'); } },
    getNativeWindowHandle: () => { const handle = Buffer.alloc(8); handle.writeBigUInt64LE(123456n); return handle; },
    isEnabled: () => state.enabled,
    setEnabled: enabled => { state.enabled = enabled; },
    isDestroyed: () => false,
    focus: () => {},
  };
  const service = new WindowsPrintService({
    getWindow: () => window, root, build: async () => 'print-helper.exe',
    spawnProcess: (executable, args, options) => {
      state.args = { executable, args, options };
      const child = new EventEmitter();
      child.stdout = new PassThrough(); child.stderr = new PassThrough();
      setImmediate(async () => {
        state.request = JSON.parse(await fs.readFile(args[0], 'utf8'));
        state.pdf = await fs.readFile(state.request.pdfPath, 'utf8');
        for (const event of events) child.stdout.write(JSON.stringify(event) + '\n');
        child.emit('close', status);
      });
      return child;
    },
  });
  return { root, state, service };
}

test('native print exports the current page layout, safely passes title/owner, and cleans up on cancellation', { skip: process.platform !== 'win32' }, async t => {
  const { root, state, service } = await fixture(t);
  assert.deepEqual(await service.print({ title: '문서 "제목" & 파일' }), { cancelled: true });
  assert.equal(state.request.title, '문서 "제목" & 파일');
  assert.equal(state.request.owner, '123456');
  assert.equal(state.pdf, '%PDF-test');
  assert.equal(state.pdfOptions.preferCSSPageSize, true);
  assert.equal(state.pdfOptions.printBackground, true);
  assert.equal(state.args.options.shell, false);
  assert.equal(state.args.options.windowsHide, true);
  assert.equal(state.enabled, true);
  assert.equal(service.printing, false);
  assert.deepEqual(await fs.readdir(path.join(root, 'print-cache')), []);
});

test('native print errors restore the parent window and remove private temporary files', { skip: process.platform !== 'win32' }, async t => {
  const { root, state, service } = await fixture(t, [{ phase: 'error', value: 'native preview failed' }], 1);
  await assert.rejects(service.print(), /native preview failed/);
  assert.equal(state.enabled, true);
  assert.equal(service.printing, false);
  assert.deepEqual(await fs.readdir(path.join(root, 'print-cache')), []);
});

test('a second print request cannot overwrite or open another active job', { skip: process.platform !== 'win32' }, async t => {
  const { service } = await fixture(t);
  const first = service.print();
  await assert.rejects(service.print(), /이미 열려/);
  await first;
});
