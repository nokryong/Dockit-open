const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function getDevServerOptions(rootDirectory = root, port = 5173) {
  return {
    root: rootDirectory,
    server: {
      host: '127.0.0.1', port, strictPort: true,
      // Generated files can number in the tens of thousands. Vite does not
      // apply .gitignore to its watcher, so keep them out of the startup crawl.
      watch: { ignored: ['**/.cache/**', '**/.dockit/**', '**/release/**'] },
    },
  };
}
async function main() {
  const dev = process.argv.includes('--dev');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.DOCKIT_DEV_SERVER_URL;
  let server;
  if (dev) {
    const { createServer } = await import('vite');
    server = await createServer(getDevServerOptions());
    await server.listen();
    env.DOCKIT_DEV_SERVER_URL = server.resolvedUrls.local[0];
    server.printUrls();
  } else if (process.argv.includes('--build') || !fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    const build = spawnSync(process.execPath, ['--max-old-space-size=8192', path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (build.status !== 0) process.exit(build.status || 1);
  }
  const child = spawn(require('electron'), dev ? ['.', '--dev'] : ['.'], { cwd: root, stdio: 'inherit', env, windowsHide: false });
  let stopping = false;
  const stop = async code => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null) child.kill();
    await server?.close();
    process.exit(code || 0);
  };
  child.on('exit', code => stop(code));
  child.on('error', error => { console.error(error.message); stop(1); });
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { getDevServerOptions };
