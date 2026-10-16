const { unzipSync } = require('fflate');
const { validateIcon, isSvgIcon, svgIcon } = require('./icons.cjs');

const SDK_VERSION = 1;
const LIMITS = { archive: 32 * 1024 * 1024, unpacked: 128 * 1024 * 1024, file: 16 * 1024 * 1024, files: 4096, data: 8 * 1024 * 1024 };
const ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const WIDGET_ID = /^[a-z][a-z0-9-]{0,63}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => Object.assign(new Error(message), { code: 'PluginError' });

function safePath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || /[\\<>:"|?*%#\x00-\x1f]/.test(value)) throw fail('잘못된 플러그인 파일 경로입니다.');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) throw fail('잘못된 플러그인 파일 경로입니다.');
  if (parts[0].toLowerCase() === '__dockit') throw fail('예약된 플러그인 파일 경로입니다.');
  return value;
}

function validateManifest(value) {
  if (!object(value) || value.manifestVersion !== 1 || value.sdkVersion !== SDK_VERSION) throw fail('지원하지 않는 플러그인 규격입니다.');
  if (typeof value.id !== 'string' || value.id.length > 100 || !ID.test(value.id)) throw fail('플러그인 ID를 확인해주세요.');
  for (const field of ['name', 'publisher', 'version']) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 120) throw fail(`플러그인 ${field} 항목을 확인해주세요.`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version)) throw fail('플러그인 버전 형식을 확인해주세요.');
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 500)) throw fail('플러그인 설명을 확인해주세요.');
  const permissions = value.permissions ?? [];
  if (!Array.isArray(permissions) || permissions.some(permission => permission !== 'storage')) throw fail('이 버전에서 지원하지 않는 플러그인 권한입니다.');
  if (!Array.isArray(value.widgets) || !value.widgets.length || value.widgets.length > 20) throw fail('플러그인 툴킷 목록을 확인해주세요.');
  const icon = validateIcon(value.icon ?? value.widgets[0]?.icon, safePath);
  const ids = new Set();
  const widgets = value.widgets.map(widget => {
    if (!object(widget) || typeof widget.id !== 'string' || !WIDGET_ID.test(widget.id) || ids.has(widget.id) || typeof widget.title !== 'string' || !widget.title.trim() || widget.title.length > 80) throw fail('플러그인 툴킷 정보를 확인해주세요.');
    ids.add(widget.id);
    const entry = safePath(widget.entry);
    if (!entry.endsWith('.html')) throw fail('툴킷의 시작 파일은 HTML이어야 합니다.');
    return { id: widget.id, title: widget.title, entry, icon: widget.icon === undefined ? icon : validateIcon(widget.icon, safePath) };
  });
  return { manifestVersion: 1, sdkVersion: SDK_VERSION, id: value.id, name: value.name, publisher: value.publisher, version: value.version, description: value.description || '', icon, permissions: [...new Set(permissions)], widgets };
}

function readPackage(bytes) {
  if (!bytes.length || bytes.length > LIMITS.archive) throw fail('플러그인 ZIP 파일은 32 MiB 이하여야 합니다.');
  let total = 0;
  const paths = new Set();
  let files;
  try {
    files = unzipSync(bytes, { filter(entry) {
      const directory = entry.name.endsWith('/');
      const name = safePath(directory ? entry.name.slice(0, -1) : entry.name);
      const key = name.normalize('NFC').toLowerCase();
      if (paths.has(key) || paths.size >= LIMITS.files) throw fail('중복되거나 너무 많은 플러그인 파일이 있습니다.');
      paths.add(key);
      total += entry.originalSize;
      if (entry.originalSize > LIMITS.file || total > LIMITS.unpacked) throw fail('압축을 푼 플러그인 크기가 너무 큽니다.');
      return !directory;
    } });
  } catch (error) {
    if (error.code === 'PluginError') throw error;
    throw fail('플러그인 ZIP 파일을 읽을 수 없습니다.');
  }
  if (!files['manifest.json'] || files['manifest.json'].length > 65536) throw fail('ZIP 최상위에 manifest.json이 필요합니다.');
  let manifest;
  try { manifest = validateManifest(JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'))); }
  catch (error) { if (error.code === 'PluginError') throw error; throw fail('manifest.json을 읽을 수 없습니다.'); }
  if (Object.values(files).reduce((size, file) => size + file.length, 0) > LIMITS.unpacked) throw fail('플러그인 크기가 너무 큽니다.');
  for (const widget of manifest.widgets) if (!files[widget.entry]) throw fail(`툴킷 시작 파일이 없습니다: ${widget.entry}`);
  for (const icon of new Set([manifest.icon, ...manifest.widgets.map(widget => widget.icon)])) {
    if (!isSvgIcon(icon)) continue;
    if (!files[icon]) throw fail(`아이콘 파일이 없습니다: ${icon}`);
    svgIcon(files[icon]);
  }
  return { manifest, files };
}

module.exports = { readPackage, validateManifest, safePath, SDK_VERSION, LIMITS, ID, object, fail };
