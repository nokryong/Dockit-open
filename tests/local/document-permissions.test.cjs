const test = require('node:test');
const assert = require('node:assert/strict');
const { allowDocumentPermission: allowLocalFonts } = require('../../electron/document-permissions.cjs');

function request(url = 'dockit://app/index.html#/docs/doc-one') {
  const contents = { id: 1, isDestroyed: () => false, getURL: () => url };
  return { contents, permission: 'local-fonts', requestingOrigin: url.split('/index.html')[0],
    details: { isMainFrame: true, requestingUrl: url }, windows: new Map([[1, { window: { webContents: contents } }]]) };
}

test('only a registered Dockit main frame can enumerate local fonts', () => {
  const args = request();
  assert.equal(allowLocalFonts(args), true);
  assert.equal(allowLocalFonts({ ...args, permission: 'media' }), false);
  assert.equal(allowLocalFonts({ ...args, permission: 'clipboard-sanitized-write' }), true);
  assert.equal(allowLocalFonts({ ...args, permission: 'clipboard-read' }), false);
  assert.equal(allowLocalFonts({ ...args, permission: 'clipboard-sanitized-write', details: { ...args.details, isMainFrame: false } }), false);
  assert.equal(allowLocalFonts({ ...args, details: { ...args.details, isMainFrame: false } }), false);
  assert.equal(allowLocalFonts({ ...args, contents: null }), false);
  assert.equal(allowLocalFonts({ ...args, windows: new Map() }), false);
  assert.equal(allowLocalFonts({ ...args, details: { isMainFrame: true } }), false);
  assert.equal(allowLocalFonts({ ...args, requestingOrigin: 'dockit-plugin://test' }), false);
  assert.equal(allowLocalFonts({ ...args, details: { isMainFrame: true, requestingUrl: 'https://example.com' } }), false);
  assert.equal(allowLocalFonts(request('https://example.com/index.html')), false);
});

test('development access requires the exact configured origin', () => {
  const args = { ...request('http://127.0.0.1:5173/index.html'), devOrigin: 'http://127.0.0.1:5173' };
  assert.equal(allowLocalFonts(args), true);
  assert.equal(allowLocalFonts({ ...args, requestingOrigin: 'http://127.0.0.1:5174' }), false);
  assert.equal(allowLocalFonts({ ...args, requestingOrigin: 'http://user@127.0.0.1:5173' }), false);
});
