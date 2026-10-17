const path = require('node:path');
const { CodexClient } = require('../../electron/codex-client.cjs');
const { createFixture } = require('./codex-fixture.cjs');
let fixture;
let client;
function install({ clipboard, dialog }) {
  fixture = createFixture();
  const status = CodexClient.prototype.status;
  CodexClient.prototype.status = function () {
    client = this;
    this.resolveCommand = fixture.resolveCommand;
    this.globalHome = path.join(process.env.DOCKIT_TEST_HOME, '.codex');
    this.createTransport = fixture.createTransport;
    this.openExternal = fixture.openExternal;
    return status.call(this);
  };
  clipboard.write = async items => {
    const png = await items[0].getType('image/png');
    if (!png.size) throw new Error('Empty clipboard image');
    fixture.state.copies = (fixture.state.copies || 0) + 1;
  };
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(process.env.DOCKIT_TEST_HOME, 'image-export.png') });
}
function mode(value) { fixture.state.mode = value; }
function stats() { return { copies: fixture.state.copies || 0, turns: fixture.state.turns, logins: fixture.state.logins, opened: fixture.state.opened }; }
function tool({ name, args = {} }) {
  const run = client.runs.get('chat');
  if (!run?.turnId) throw new Error('No active fixture turn');
  return client.toolCall({ threadId: run.threadId, turnId: run.turnId, tool: name, arguments: args });
}
function complete(status = 'completed') {
  const run = client.runs.get('chat');
  client.notification('turn/completed', { threadId: run.threadId, turn: { id: run.turnId, status } });
}
module.exports = { install, mode, stats, tool, complete };
