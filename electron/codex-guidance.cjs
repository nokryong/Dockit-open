const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function defaultCodexHome(env = process.env) {
  return path.resolve(env.CODEX_HOME || path.join(os.homedir(), '.codex'));
}

async function readGlobalGuidance(home) {
  // Match Codex's global precedence and default 32 KiB instruction budget.
  for (const name of ['AGENTS.override.md', 'AGENTS.md']) {
    let handle;
    try {
      handle = await fs.open(path.join(home, name), 'r');
      if (!(await handle.stat()).isFile()) continue;
      const buffer = Buffer.alloc(32 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const text = new TextDecoder().decode(buffer.subarray(0, bytesRead), { stream: true }).trim();
      if (text)
        return `Global user guidance (${path.join(home, name)}):\nApply these as the user's defaults; explicit user requests take precedence.\n\n${text}`;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    } finally {
      await handle?.close();
    }
  }
  return '';
}

async function sharedSkillRoots(home, userHome = os.homedir()) {
  const roots = [];
  for (const directory of [path.join(home, 'skills'), path.join(userHome, '.agents', 'skills')]) {
    try {
      if ((await fs.stat(directory)).isDirectory()) roots.push(await fs.realpath(directory));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return [...new Set(roots)];
}

function skillReaderConfig(roots) {
  return {
    'mcp_servers.dockit_skills': {
      command: process.execPath,
      args: [path.join(__dirname, 'codex-skills-server.cjs'), ...roots],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      startup_timeout_sec: 10,
      enabled_tools: ['read_skill']
    }
  };
}

module.exports = { defaultCodexHome, readGlobalGuidance, sharedSkillRoots, skillReaderConfig };
