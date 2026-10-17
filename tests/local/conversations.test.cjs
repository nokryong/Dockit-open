const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Conversations } = require('../../electron/conversations.cjs');

test('legacy migration, per-window selection, retained threads, restart and trash deletion', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-conversations-'));
  const trash = [];
  t.after(async () => { assert.equal(path.dirname(home), os.tmpdir()); await fs.rm(home, { recursive: true, force: true }); });
  let account = 'account-a', buffer = { messages: [{ role: 'user', text: '기존 대화' }], threadId: 'native-1' };
  const options = { root: home, provider: 'codex', account: async () => account, legacy: async () => buffer,
    trash: async file => { const to = path.join(home, `trash-${trash.length}.json`); await fs.rename(file, to); trash.push(to); },
    activate: async record => { buffer = structuredClone(record); }, snapshot: () => buffer };
  const chats = new Conversations(options);
  assert.equal((await chats.history(1))[0].text, '기존 대화');
  const old = (await chats.list())[0].id;
  await chats.create(1, 'document-a');
  await chats.run(1, 'document-a', async () => {
    buffer.messages.push({ role: 'user', text: '새 대화' }); buffer.threadId = 'native-2';
    await chats.write(account, buffer);
    await assert.rejects(chats.remove(1, chats.active.record.id));
  });
  const items = await chats.list(); assert.equal(items.length, 2);
  const recent = items.find(item => item.id !== old).id;
  await chats.select(2, old);
  assert.equal((await chats.history(1))[0].text, '새 대화');
  assert.equal((await chats.history(2))[0].text, '기존 대화');
  await chats.run(2, null, async () => assert.equal(buffer.threadId, 'native-1'));
  const restarted = new Conversations(options);
  assert.equal((await restarted.history(3, 'document-a'))[0].text, '새 대화');
  await restarted.remove(3, recent);
  assert.equal(trash.length, 1); assert.deepEqual(await restarted.history(3), []);
  await restarted.remove(3, old);
  assert.deepEqual(await (new Conversations(options)).list(), []); // no resurrection from legacy buffer
  await assert.rejects(restarted.select(3, '../account-b/index'));
  account = 'account-b'; buffer = { messages: [] };
  assert.deepEqual(await restarted.list(), []);
  await assert.rejects(restarted.select(3, old));
});
