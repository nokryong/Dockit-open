const { parseGitHubUrl, inspectGitHubPlugins, downloadGitHubPlugin } = require('./plugin-github.cjs');
const { fail } = require('../plugin-sdk/manifest.cjs');

function compareVersions(left, right) {
  const [a, ap] = left.split(/-(.*)/s);
  const [b, bp] = right.split(/-(.*)/s);
  const order = (x, y) => x < y ? -1 : x > y ? 1 : 0;
  const av = a.split('.').map(BigInt), bv = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return order(av[i], bv[i]);
  if (ap === undefined || bp === undefined) return ap === bp ? 0 : ap === undefined ? 1 : -1;
  const aa = ap.split('.'), bb = bp.split('.');
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === bb[i]) continue;
    if (aa[i] === undefined || bb[i] === undefined) return aa[i] === undefined ? -1 : 1;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    if (an !== bn) return an ? -1 : 1;
    const result = order(an ? BigInt(aa[i]) : aa[i], bn ? BigInt(bb[i]) : bb[i]);
    if (result) return result;
  }
  return 0;
}

const repositoryUrl = source => `https://github.com/${source.owner.toLowerCase()}/${source.repo.toLowerCase()}/tree/${encodeURIComponent(source.ref)}`;
function sourceFor(snapshot, folder) {
  return normalizeSource({ url: repositoryUrl(snapshot) + (folder ? '/' + folder.split('/').map(encodeURIComponent).join('/') : ''), commit: snapshot.commit });
}
function normalizeSource(source) {
  const parsed = parseGitHubUrl(source?.url);
  if (source.commit !== null && !/^[a-f0-9]{40}$/.test(source.commit || '')) throw fail('플러그인 설치 출처를 확인해주세요.');
  return { url: repositoryUrl(parsed) + (parsed.folder ? '/' + parsed.folder.split('/').map(encodeURIComponent).join('/') : ''), commit: source.commit };
}
function legacySource(plugin) {
  // These two official plugins shipped before install receipts were introduced.
  const folder = { 'dockit.dice': 'dice', 'dockit.image-search': 'image-search' }[plugin.id];
  return plugin.publisher === 'nokryong' && folder ? { url: `https://github.com/nokryong/dockit-plugins/tree/main/plugins/${folder}`, commit: null } : null;
}

class PluginUpdates {
  constructor({ store, inspect = inspectGitHubPlugins, download = downloadGitHubPlugin }) {
    Object.assign(this, { store, inspect, download });
    this.available = new Map();
    this.checking = null;
  }

  check() {
    if (this.checking) return this.checking;
    this.checking = this.scan().finally(() => { this.checking = null; });
    return this.checking;
  }

  async scan() {
    const groups = new Map();
    for (const plugin of this.store.list().plugins) {
      const source = this.store.source(plugin.id);
      if (!source) continue;
      const parsed = parseGitHubUrl(source.url);
      const url = repositoryUrl(parsed);
      if (!groups.has(url)) groups.set(url, []);
      groups.get(url).push({ plugin, source, folder: parsed.folder });
    }
    const errors = [];
    const found = new Map();
    // One repository snapshot for all installed plugins on the same branch.
    for (const [url, entries] of groups) {
      try {
        const snapshot = await this.inspect(url, { folders: entries.map(entry => entry.folder) });
        for (const { plugin, source, folder } of entries) {
          const latest = snapshot.plugins.find(item => item.path === folder && item.id === plugin.id && item.publisher === plugin.publisher);
          if (!latest || compareVersions(latest.version, plugin.version) <= 0) continue;
          if (this.store.installed.get(plugin.id)?.version !== plugin.version || this.store.source(plugin.id)?.url !== source.url) continue;
          found.set(plugin.id, { snapshot, latest, fromVersion: plugin.version, source: sourceFor(snapshot, folder) });
        }
      } catch (error) { errors.push(error.message); }
    }
    this.available = found;
    return { updates: [...found].map(([id, entry]) => ({ id, version: entry.latest.version })), errors: [...new Set(errors)] };
  }

  async update(id) {
    const entry = this.available.get(id);
    if (!entry || this.store.installed.get(id)?.version !== entry.fromVersion) throw fail('플러그인 목록을 다시 열어 업데이트를 확인해주세요.');
    const bytes = await this.download(entry.snapshot, entry.latest.path);
    const plugin = await this.store.updateBytes(id, bytes, entry.source);
    this.available.delete(id);
    return plugin;
  }
}

module.exports = { PluginUpdates, compareVersions, normalizeSource, sourceFor, legacySource };
