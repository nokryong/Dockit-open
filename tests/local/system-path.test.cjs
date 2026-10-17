const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSystemPath } = require('../../electron/system-path.cjs');

test('macOS system aliases normalize only their verified prefix', async () => {
  const calls = [];
  const options = { platform: 'darwin', realpath: async value => { calls.push(value); return `/private${value}`; } };
  assert.equal(await resolveSystemPath('/var/folders/example/document.dkt', options), '/private/var/folders/example/document.dkt');
  assert.equal(await resolveSystemPath('/tmp/skills/SKILL.md', options), '/private/tmp/skills/SKILL.md');
  assert.deepEqual(calls, ['/var', '/tmp']);
  assert.equal(await resolveSystemPath('/various/document.dkt', options), '/various/document.dkt');
  assert.equal(await resolveSystemPath('/Users/user/linked/document.dkt', options), '/Users/user/linked/document.dkt');
  assert.equal(await resolveSystemPath('/var/secret', { platform: 'darwin', realpath: async () => '/untrusted' }), '/var/secret');
  assert.equal(await resolveSystemPath('/tmp/file', { platform: 'linux', realpath: () => { throw Error('Unexpected resolution'); } }), '/tmp/file');
});
