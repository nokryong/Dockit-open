const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { t, setLanguage, normalizeLanguage, resolveLanguage } = require('../../electron/i18n.cjs');
const catalog = require('../../desktop/locales/en.json');
const { LocalStore } = require('../../electron/local-store.cjs');
const { safeFailure } = require('../../electron/chatgpt-client.cjs');
const { fail } = require('../../electron/chatgpt-oauth.cjs');
const root = path.join(__dirname, '../..');

test('English catalog covers interface calls and preserves interpolation parameters', () => {
  for (const [source, translation] of Object.entries(catalog)) {
    assert.equal(typeof translation, 'string');
    assert.ok(translation.length, source);
    const parameters = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
    assert.deepEqual(parameters(translation), parameters(source), source);
  }
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.(?:js|jsx|cjs)$/.test(file)) continue;
      const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
      const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(sf) === 'uiText' && ts.isStringLiteral(node.arguments[0])) {
          assert.ok(Object.hasOwn(catalog, node.arguments[0].text), `${file}: ${node.arguments[0].text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  };
  for (const directory of ['app', 'desktop', 'electron']) walk(path.join(root, directory));
});

test('native translation defaults to Korean and interpolates without rewriting values', () => {
  setLanguage('ko');
  assert.equal(t('새 문서'), '새 문서');
  setLanguage('en');
  assert.equal(t('새 문서'), 'New document');
  assert.equal(t("'{0}'을 불러왔습니다.", '한글 파일.dkt'), "Imported '한글 파일.dkt'.");
  assert.equal(t('Unknown {0}', 'value'), 'Unknown value');
  assert.equal(normalizeLanguage('fr'), 'ko');
  setLanguage('ko');
});

test('system language is the default and other system languages fall back to English', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dockit-language-default-'));
  const store = new LocalStore({ home });
  await store.init();
  assert.equal((await store.config()).setting.language, 'system');
  assert.equal(resolveLanguage('system', 'ko'), 'ko');
  assert.equal(resolveLanguage('system', 'ko-KR'), 'ko');
  assert.equal(resolveLanguage('system', 'en-US'), 'en');
  assert.equal(resolveLanguage('system', 'ja'), 'en');
  assert.equal(resolveLanguage('system', ''), 'en');
  assert.equal(resolveLanguage(undefined, 'ko'), 'ko');
  assert.equal(resolveLanguage('ko', 'en-US'), 'ko');
  assert.equal(resolveLanguage('en', 'ko'), 'en');
});

test('language settings persist while existing document contents remain unchanged', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dockit-language-store-'));
  const store = new LocalStore({ home });
  await store.init();
  const document = (await store.request('create', { type: 'documents', data: { title: '한국어 문서', content: '<p>한국어 원문 and English</p>' } })).content;
  const before = await store.request('get', { type: 'documents', id: document._id });
  await store.request('update', { type: 'setting', data: { language: 'en' } });
  const reopened = new LocalStore({ home });
  await reopened.init();
  assert.equal((await reopened.config()).setting.language, 'en');
  assert.deepEqual(await reopened.request('get', { type: 'documents', id: document._id }), before);
});

test('English app failures retain actions while raw transport details stay private', () => {
  setLanguage('en');
  try {
    const failure = fail(t('ChatGPT 연결이 만료되었습니다. 다시 연결해주세요.'), 'expired');
    failure.detail = { action: 'signin' };
    assert.deepEqual(safeFailure(failure), { message: 'The ChatGPT connection expired. Please reconnect.', code: 'expired', detail: { action: 'signin' } });
    const raw = safeFailure(new Error('네트워크 오류: private_token=do-not-expose'));
    assert.equal(raw.code, 'connection_failed');
    assert.ok(!raw.message.includes('private_token'));
    assert.equal(safeFailure(new Error(t('OS의 안전한 인증 정보 저장소를 사용할 수 없습니다.'))).message, 'The OS secure credential store is unavailable.');
  } finally { setLanguage('ko'); }
});
