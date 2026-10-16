const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

async function buildWindowsPrint(options = {}) {
  if (process.platform !== 'win32') throw new Error('Windows 인쇄 기능입니다.');
  const root = path.join(__dirname, '..');
  const source = path.join(root, 'native', 'windows-print', 'Program.cs');
  const manifest = path.join(root, 'native', 'windows-print', 'app.manifest');
  const outputDir = options.outputDir || path.join(root, '.cache', 'native', 'windows-print');
  const output = path.join(outputDir, 'DockitPrint.exe');
  const hashFile = path.join(outputDir, 'source.sha256');
  const hash = createHash('sha256').update(fs.readFileSync(source)).update(fs.readFileSync(manifest)).digest('hex');
  if (fs.existsSync(output) && fs.existsSync(hashFile) && fs.readFileSync(hashFile, 'utf8') === hash) return output;
  const windows = process.env.SystemRoot || 'C:\\Windows';
  const framework = path.join(windows, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const metadata = path.join(windows, 'System32', 'WinMetadata');
  const compiler = path.join(framework, 'csc.exe');
  if (!fs.existsSync(compiler) || !fs.existsSync(metadata)) throw new Error('Windows 인쇄 구성요소를 찾을 수 없습니다.');
  fs.mkdirSync(outputDir, { recursive: true });
  const buildSource = path.join(outputDir, 'Program.cs');
  const buildManifest = path.join(outputDir, 'app.manifest');
  fs.writeFileSync(buildSource, fs.readFileSync(source));
  fs.writeFileSync(buildManifest, fs.readFileSync(manifest));
  const references = fs.readdirSync(metadata).filter(name => name.endsWith('.winmd')).map(name => '/r:' + path.join(metadata, name));
  for (const name of ['System.Runtime', 'System.Runtime.WindowsRuntime', 'System.Runtime.InteropServices.WindowsRuntime', 'System.Runtime.WindowsRuntime.UI.Xaml']) references.push('/r:' + path.join(framework, name + '.dll'));
  references.push('/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll');
  await new Promise((resolve, reject) => {
    const child = spawn(compiler, ['/nologo', '/utf8output', '/target:exe', '/platform:x64', '/win32manifest:' + buildManifest, '/out:' + output, ...references, buildSource], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostics = '';
    child.stdout.on('data', data => { diagnostics += data; });
    child.stderr.on('data', data => { diagnostics += data; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Windows 인쇄 모듈 빌드 실패: ' + diagnostics.trim())));
  });
  fs.writeFileSync(hashFile, hash);
  return output;
}

module.exports = { buildWindowsPrint };
if (require.main === module) buildWindowsPrint().then(file => console.log(file)).catch(error => { console.error(error.message); process.exitCode = 1; });
