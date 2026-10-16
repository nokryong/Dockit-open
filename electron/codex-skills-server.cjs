const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const MAX_BYTES = 256 * 1024;
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.py', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.css', '.html', '.csv', '.xml']);
const within = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function readSkill(file, roots) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) throw new Error('Invalid skill path');
  const candidate = path.resolve(file);
  if (!roots.some(root => within(root, candidate))) throw new Error('Outside skill roots');
  const actual = await fs.realpath(candidate);
  // A reference or symlink must not expose auth.json or files outside a skill folder.
  if (!roots.some(root => within(root, actual))) throw new Error('Outside skill roots');
  const handle = await fs.open(actual, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Invalid skill file');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_BYTES) throw new Error('Skill file too large');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
    if (text.includes('\0')) throw new Error('Not a text file');
    return text;
  } finally { await handle.close(); }
}

function createSkillHandler(roots) {
  return async message => {
    if (message.id === undefined) return null;
    const result = value => ({ jsonrpc: '2.0', id: message.id, result: value });
    if (message.method === 'initialize') return result({
      protocolVersion: '2024-11-05', capabilities: { tools: {} },
      serverInfo: { name: 'dockit-skills', version: '1.0.0' }
    });
    if (message.method === 'ping') return result({});
    if (message.method === 'tools/list') return result({ tools: [{
      name: 'read_skill',
      description: 'Read a local SKILL.md or its text references from the available skill folders. Use this to load skill instructions before following them. Does not execute scripts.',
      inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Absolute path to the skill file or a referenced text file.' } }, required: ['path'], additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }] });
    if (message.method === 'tools/call' && message.params?.name === 'read_skill') {
      try { return result({ content: [{ type: 'text', text: await readSkill(message.params.arguments?.path, roots) }] }); }
      catch { return result({ isError: true, content: [{ type: 'text', text: 'Cannot read this skill file. Only text files inside the available skill folders, up to 256 KiB, are allowed.' }] }); }
    }
    return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported method' } };
  };
}

async function main() {
  const roots = [];
  for (const directory of process.argv.slice(2)) {
    try { if (path.isAbsolute(directory) && (await fs.stat(directory)).isDirectory()) roots.push(await fs.realpath(directory)); }
    catch { /* A removed skill folder is simply unavailable. */ }
  }
  const handle = createSkillHandler(roots);
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    let response;
    try {
      if (line.length > 1024 * 1024) throw new Error('Request too large');
      const message = JSON.parse(line);
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid request');
      response = await handle(message);
    } catch { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }; }
    if (response) process.stdout.write(JSON.stringify(response) + '\n');
  }
}

if (require.main === module) main().catch(() => { process.exitCode = 1; });
module.exports = { readSkill, createSkillHandler };
