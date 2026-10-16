const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ChatAttachments, CHATGPT_MAX_FILE_BYTES } = require('../../electron/chat-attachments.cjs');
const { png } = require('../helpers/codex-fixture.cjs');

test('selected files are copied, scoped to the account, and serialized as native Responses inputs', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-attachments-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('dockit-attachments-test-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = path.join(root, 'sample.txt');
  const image = path.join(root, 'sample.png');
  const pdf = path.join(root, 'sample.pdf');
  await fs.writeFile(source, '첨부 원문');
  await fs.writeFile(image, Buffer.from(png, 'base64'));
  await fs.writeFile(pdf, '%PDF-1.4\n%%EOF');
  const store = new ChatAttachments(root, 'chatgpt');
  const selected = await store.add('one', [source, image, pdf]);
  assert.deepEqual(selected.map(file => file.name), ['sample.txt', 'sample.png', 'sample.pdf']);
  assert.ok(!JSON.stringify(selected).includes(root));
  await fs.writeFile(source, 'changed after selection');
  const input = await store.responseMessage('one', { role: 'user', text: '확인해줘', attachments: selected });
  assert.equal(input.content[0].type, 'input_text');
  assert.equal(input.content[1].type, 'input_file');
  assert.equal(Buffer.from(input.content[1].file_data.split(',')[1], 'base64').toString(), '첨부 원문');
  assert.equal(input.content[2].type, 'input_image');
  assert.equal(input.content[3].filename, 'sample.pdf');
  await assert.rejects(store.read('other', selected), { code: 'invalid_attachment' });
  await assert.rejects(store.read('../one', selected), { code: 'invalid_attachment' });
  await assert.rejects(store.read('one', [{ id: '../auth.json' }]), { code: 'invalid_attachment' });
  const native = new ChatAttachments(root, 'codex');
  await assert.rejects(native.add('one', [pdf]), /이미지와 텍스트/);
  const nativeImage = await native.add('one', [image]);
  assert.equal(path.extname((await native.read('one', nativeImage))[0].path), '.png');
  const invalid = path.join(root, 'fake.png');
  await fs.writeFile(invalid, 'not an image');
  await assert.rejects(store.add('one', [invalid]), { code: 'invalid_attachment' });
  for (const provider of [store, native]) {
    const many = await provider.add('one', Array(11).fill(source));
    assert.equal((await provider.read('one', many)).length, 11);
  }
  const large = path.join(root, 'large.txt');
  await fs.writeFile(large, Buffer.alloc(CHATGPT_MAX_FILE_BYTES + 1, 97));
  await assert.rejects(store.add('one', [large]), { code: 'invalid_attachment' });
  const largeSelection = await native.add('one', [large]);
  assert.equal((await native.read('one', largeSelection))[0].bytes.length, CHATGPT_MAX_FILE_BYTES + 1);
  assert.doesNotThrow(() => store.validateFileSize('image', CHATGPT_MAX_FILE_BYTES + 1, 0));
  assert.throws(() => store.validateFileSize('text', CHATGPT_MAX_FILE_BYTES, 0), { code: 'invalid_attachment' });
  assert.throws(() => store.validateFileSize('text', 1, CHATGPT_MAX_FILE_BYTES), { code: 'invalid_attachment' });
  assert.doesNotThrow(() => store.validateFileSize('text', CHATGPT_MAX_FILE_BYTES - 1, 1));
});
