const { createHash } = require('node:crypto');
const { zipSync } = require('fflate');
const { LIMITS, safePath, validateManifest, fail } = require('../plugin-sdk/manifest.cjs');

const SHA = /^[a-f0-9]{40}$/;
const HOSTS = new Set(['api.github.com', 'raw.githubusercontent.com']);
const blobHash = bytes => createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');

function parseGitHubUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw fail('GitHub 저장소 또는 플러그인 폴더 주소를 입력해주세요.');
  let url;
  try { url = new URL(value.trim()); } catch { throw fail('GitHub 주소를 확인해주세요.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw fail('https://github.com/으로 시작하는 주소를 입력해주세요.');
  let parts;
  try { parts = url.pathname.replace(/\/$/, '').slice(1).split('/').map(decodeURIComponent); } catch { throw fail('GitHub 주소를 확인해주세요.'); }
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner || '') || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo || '') || ['.', '..'].includes(repo)) throw fail('GitHub 저장소 주소를 확인해주세요.');
  let ref = 'HEAD';
  let folder = '';
  if (parts.length > 2) {
    if (parts[2] !== 'tree' || !parts[3]) throw fail('GitHub 저장소 또는 /tree/가 포함된 폴더 주소를 입력해주세요.');
    ref = parts[3];
    if (ref.length > 256 || /[\x00-\x1f\\]/.test(ref)) throw fail('GitHub 브랜치를 확인해주세요.');
    folder = parts.length > 4 ? safePath(parts.slice(4).join('/')) : '';
  }
  return { owner, repo, ref, folder };
}

async function requestBytes(url, { fetcher, signal, limit, api = false }) {
  for (let redirects = 0; redirects <= 4; redirects++) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !HOSTS.has(target.hostname) || target.port || target.username || target.password) throw fail('허용되지 않은 플러그인 다운로드 주소입니다.');
    const response = await fetcher(target.href, {
      redirect: 'manual', signal,
      headers: { Accept: api ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'Dockit-Open', ...(api ? { 'X-GitHub-Api-Version': '2026-03-10' } : {}) },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw fail('다운로드 주소를 찾지 못했습니다.');
      url = new URL(location, target).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) throw fail('공개된 GitHub 저장소와 폴더 주소를 확인해주세요.');
      if ([403, 429].includes(response.status)) throw fail('GitHub 요청이 제한되었습니다. 잠시 후 다시 시도해주세요.');
      throw fail('GitHub에서 플러그인을 받지 못했습니다. (' + response.status + ')');
    }
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw fail('플러그인 다운로드 크기가 너무 큽니다.');
    }
    const chunks = [];
    let length = 0;
    if (!response.body) throw fail('다운로드한 파일이 비어 있습니다.');
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) throw fail('플러그인 다운로드 크기가 너무 큽니다.');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw fail('다운로드 주소가 너무 많이 변경되었습니다.');
}

const optionsFor = options => ({ fetcher: options?.fetcher || globalThis.fetch, signal: options?.signal || AbortSignal.timeout(60000) });
async function networkTask(options, task) {
  try { return await task(); }
  catch (error) {
    if (error.code === 'PluginError') throw error;
    if (options.signal.aborted) throw fail('플러그인 다운로드 시간이 초과되었습니다. 다시 시도해주세요.');
    throw fail('GitHub에 연결하지 못했습니다. 네트워크를 확인해주세요.');
  }
}
async function json(url, options, limit = 2 * 1024 * 1024) {
  const bytes = await requestBytes(url, { ...options, api: true, limit });
  try { return JSON.parse(bytes); } catch { throw fail('GitHub 저장소 정보를 읽을 수 없습니다.'); }
}
function checkedFile(entry, limit = LIMITS.file) {
  if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw fail('플러그인에 심볼릭 링크나 서브모듈을 포함할 수 없습니다.');
  safePath(entry.path);
  if (!SHA.test(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > limit) throw fail('플러그인 파일 크기 또는 정보를 확인해주세요.');
}
async function getFile(snapshot, entry, options, limit = LIMITS.file) {
  checkedFile(entry, limit);
  const pathname = entry.path.split('/').map(encodeURIComponent).join('/');
  const bytes = await requestBytes('https://raw.githubusercontent.com/' + snapshot.owner + '/' + snapshot.repo + '/' + snapshot.commit + '/' + pathname, { ...options, limit });
  if (bytes.length !== entry.size || blobHash(bytes) !== entry.sha) throw fail('플러그인 파일의 무결성 검사에 실패했습니다.');
  return bytes;
}
async function mapFiles(items, mapper) {
  const results = new Array(items.length);
  let next = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try { results[index] = await mapper(items[index]); } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  return results;
}

async function inspectGitHubPlugins(value, suppliedOptions) {
  const source = parseGitHubUrl(value);
  const options = optionsFor(suppliedOptions);
  return networkTask(options, async () => {
    const api = 'https://api.github.com/repos/' + source.owner + '/' + source.repo;
    const commits = await json(api + '/commits?per_page=1&sha=' + encodeURIComponent(source.ref), options);
    const commit = commits[0]?.sha;
    const treeSha = commits[0]?.commit?.tree?.sha;
    if (!SHA.test(commit || '') || !SHA.test(treeSha || '')) throw fail('GitHub 저장소의 버전을 확인할 수 없습니다.');
    const tree = await json(api + '/git/trees/' + treeSha + '?recursive=1', options, 8 * 1024 * 1024);
    if (tree.truncated || !Array.isArray(tree.tree)) throw fail('GitHub 파일 목록을 모두 읽지 못했습니다.');
    const snapshot = { ...source, commit, tree: tree.tree };
    const prefix = source.folder ? source.folder + '/' : '';
    let manifests = tree.tree.filter(entry => entry.path === prefix + 'manifest.json');
    if (!manifests.length) {
      const collection = prefix || 'plugins/';
      manifests = tree.tree.filter(entry => entry.path.startsWith(collection) && /^[^/]+\/manifest\.json$/.test(entry.path.slice(collection.length)));
    }
    if (!manifests.length) throw fail('플러그인 manifest.json을 찾지 못했습니다.');
    snapshot.plugins = await mapFiles(manifests, async entry => {
      const bytes = await getFile(snapshot, entry, options, 65536);
      let manifest;
      try { manifest = validateManifest(JSON.parse(bytes)); }
      catch (error) { if (error.code === 'PluginError') throw error; throw fail('플러그인 manifest.json을 읽을 수 없습니다.'); }
      return { ...manifest, path: entry.path.slice(0, -'manifest.json'.length).replace(/\/$/, '') };
    });
    return snapshot;
  });
}

async function downloadGitHubPlugin(snapshot, folder, suppliedOptions) {
  const plugin = snapshot?.plugins?.find(item => item.path === folder);
  if (!plugin || !SHA.test(snapshot.commit || '')) throw fail('설치할 플러그인을 다시 선택해주세요.');
  const options = optionsFor(suppliedOptions);
  return networkTask(options, async () => {
    const prefix = folder ? safePath(folder) + '/' : '';
    const entries = snapshot.tree.filter(entry => entry.path.startsWith(prefix) && entry.type !== 'tree');
    if (!entries.length || entries.length > LIMITS.files) throw fail('플러그인 파일 개수를 확인해주세요.');
    const paths = new Set();
    let size = 0;
    for (const entry of entries) {
      checkedFile(entry);
      const relative = safePath(entry.path.slice(prefix.length));
      const key = relative.normalize('NFC').toLowerCase();
      if (paths.has(key)) throw fail('중복된 플러그인 파일 경로입니다.');
      paths.add(key);
      size += entry.size;
      if (size > LIMITS.unpacked) throw fail('플러그인 크기가 너무 큽니다.');
    }
    const files = Object.fromEntries(await mapFiles(entries, async entry => [entry.path.slice(prefix.length), await getFile(snapshot, entry, options)]));
    return zipSync(files);
  });
}

module.exports = { parseGitHubUrl, inspectGitHubPlugins, downloadGitHubPlugin, blobHash };
