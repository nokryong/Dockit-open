const path = require('node:path');
const { CodexClient } = require('../../electron/codex-client.cjs');
const { createFixture } = require('./codex-fixture.cjs');
let fixture;
function install({ clipboard, dialog }) {
  fixture = createFixture();
  const status = CodexClient.prototype.status;
  CodexClient.prototype.status = function () {
    this.resolveCommand = fixture.resolveCommand;
    this.globalHome = path.join(process.env.DOCKIT_TEST_HOME, '.codex');
    this.createTransport = fixture.createTransport;
    this.openExternal = fixture.openExternal;
    return status.call(this);
  };
  clipboard.writeImage = image => { if (image.isEmpty()) throw new Error('Empty clipboard image'); fixture.state.copies = (fixture.state.copies || 0) + 1; };
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(process.env.DOCKIT_TEST_HOME, 'image-export.png') });
}
function mode(value) { fixture.state.mode = value; }
function stats() { return { copies: fixture.state.copies || 0, turns: fixture.state.turns, logins: fixture.state.logins, opened: fixture.state.opened }; }
module.exports = { install, mode, stats };
