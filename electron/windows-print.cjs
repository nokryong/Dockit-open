const { t: uiText } = require('./i18n.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildWindowsPrint } = require('../scripts/build-windows-print.cjs');

class WindowsPrintService {
  constructor({ getWindow, root, build = buildWindowsPrint, spawnProcess = spawn }) {
    this.getWindow = getWindow;
    this.build = build;
    this.spawnProcess = spawnProcess;
    this.buildRoot = path.join(root, 'native', 'windows-print');
    this.root = path.join(root, 'print-cache');
    this.printing = false;
  }

  async print(options = {}) {
    if (this.printing) throw new Error(uiText('인쇄창이 이미 열려 있습니다.'));
    if (process.platform !== 'win32') throw new Error(uiText('Windows 인쇄 기능입니다.'));
    this.printing = true;
    const window = this.getWindow();
    let directory;
    let disabled = false;
    try {
      const executable = await this.build({ outputDir: this.buildRoot });
      await window.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('.printable-area img')].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })));
      })()`);
      const pdf = await window.webContents.printToPDF({
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });
      await fs.mkdir(this.root, { recursive: true });
      directory = await fs.mkdtemp(path.join(this.root, 'job-'));
      const pdfPath = path.join(directory, 'document.pdf');
      const requestPath = path.join(directory, 'request.json');
      const handle = window.getNativeWindowHandle();
      const owner = handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString();
      await fs.writeFile(pdfPath, pdf);
      await fs.writeFile(
        requestPath,
        JSON.stringify({ pdfPath, owner, title: typeof options.title === 'string' ? options.title : 'Dockit Open' })
      );
      if (window.isEnabled()) {
        window.setEnabled(false);
        disabled = true;
      }
      return await new Promise((resolve, reject) => {
        const child = this.spawnProcess(executable, [requestPath], {
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        let pending = '';
        let failure;
        let completion;
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          pending += chunk;
          const lines = pending.split(/\r?\n/);
          pending = lines.pop();
          for (const line of lines) {
            let event;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.phase === 'error') failure = new Error(event.value);
            if (event.phase === 'completed') completion = event.value;
          }
        });
        child.stderr.on('data', () => {});
        child.once('error', reject);
        child.once('close', code => {
          if (failure || code !== 0) reject(failure || new Error(uiText('Windows 인쇄창을 열지 못했습니다.')));
          else resolve({ cancelled: completion === 'Canceled' });
        });
      });
    } finally {
      if (disabled && !window.isDestroyed()) {
        window.setEnabled(true);
        window.focus();
      }
      if (directory) {
        await Promise.allSettled(['document.pdf', 'request.json'].map(name => fs.unlink(path.join(directory, name))));
        await fs.rmdir(directory).catch(() => {});
      }
      this.printing = false;
    }
  }
}

module.exports = { WindowsPrintService };
