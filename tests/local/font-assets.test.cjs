const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFontAsset, readFontAsset } = require('../../electron/font-assets.cjs');

test('font bridge accepts only existing providers and font/stylesheet paths', () => {
  assert.equal(validateFontAsset('https://cdn.jsdelivr.net/gh/example/font.woff2').style, false);
  assert.equal(validateFontAsset('https://fonts.googleapis.com/css2?family=Noto+Sans+KR').style, true);
  for (const url of ['file:///C:/secret', 'https://example.com/font.woff2', 'http://cdn.jsdelivr.net/font.woff2', 'https://cdn.jsdelivr.net/config.json', 'https://user:secret@cdn.jsdelivr.net/font.woff2'])
    assert.throws(() => validateFontAsset(url));
});

test('font bridge rejects redirects outside the font providers', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private.woff2' } });
  await assert.rejects(readFontAsset('https://cdn.jsdelivr.net/redirect-test.woff2'), /허용되지 않은/);
});

test('font bridge returns self-contained font data and caches downloads', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  global.fetch = async () => { calls++; return new Response(Buffer.from('font bytes')); };
  const url = 'https://cdn.jsdelivr.net/font-cache-test.woff2';
  const expected = { dataUrl: 'data:font/woff2;base64,' + Buffer.from('font bytes').toString('base64') };
  assert.deepEqual(await readFontAsset(url), expected);
  assert.deepEqual(await readFontAsset(url), expected);
  assert.equal(calls, 1);
});
