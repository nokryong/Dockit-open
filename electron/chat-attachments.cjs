const { t: uiText } = require('./i18n.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { contained, atomicJson } = require('./local-store.cjs');

const CHATGPT_MAX_FILE_BYTES = 50 * 1024 * 1024;
const TEXT_EXTENSIONS =
  'txt md markdown csv tsv json jsonl html htm xml yaml yml log js jsx ts tsx css scss py rb rs go java c cpp h sh sql toml ini dockit'.split(
    ' '
  );
const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const fail = message => Object.assign(new Error(message), { code: 'invalid_attachment', dockit: true });
const extensions = provider => [
  ...Object.keys(IMAGE_TYPES),
  ...TEXT_EXTENSIONS,
  ...(provider === 'chatgpt' ? Object.keys(DOCUMENT_TYPES) : [])
];
const metadata = file => ({ id: file.id, name: file.name, size: file.size, mime: file.mime, kind: file.kind });
const suffix = file =>
  file.kind === 'image' ? { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.mime] : 'bin';

function format(name, provider) {
  const extension = path.extname(name).slice(1).toLowerCase();
  if (IMAGE_TYPES[extension]) return { mime: IMAGE_TYPES[extension], kind: 'image' };
  if (TEXT_EXTENSIONS.includes(extension)) return { mime: 'text/plain', kind: 'text' };
  if (provider === 'chatgpt' && DOCUMENT_TYPES[extension]) return { mime: DOCUMENT_TYPES[extension], kind: 'document' };
  throw fail(
    provider === 'codex'
      ? uiText('Codex에는 이미지와 텍스트 파일을 첨부할 수 있습니다.')
      : uiText('지원하지 않는 첨부 파일 형식입니다.')
  );
}
function textContent(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
    return text;
  } catch {
    throw fail(uiText('텍스트 첨부 파일은 UTF-8 형식으로 저장해주세요.'));
  }
}
function validateImage(bytes, mime) {
  const valid =
    mime === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw fail(uiText('첨부 이미지의 파일 형식을 확인해주세요.'));
}

class ChatAttachments {
  constructor(root, provider) {
    this.root = root;
    this.provider = provider;
  }
  validateFileSize(kind, size, total) {
    // Responses input_file limits do not apply to input_image or Codex local inputs.
    if (
      this.provider === 'chatgpt' &&
      kind !== 'image' &&
      (size >= CHATGPT_MAX_FILE_BYTES || total + size > CHATGPT_MAX_FILE_BYTES)
    )
      throw fail(uiText('ChatGPT 첨부 파일은 각각 50MB 미만, 전체 50MB 이하여야 합니다.'));
  }
  async directory(scope) {
    if (typeof scope !== 'string' || !/^[\w-]{1,100}$/.test(scope))
      throw fail(uiText('첨부 파일의 계정을 확인하지 못했습니다.'));
    const folder = await contained(this.root, path.join(this.root, 'ai', 'attachments', this.provider, scope));
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    return folder;
  }
  async add(scope, paths) {
    if (!Array.isArray(paths) || !paths.length) throw fail(uiText('첨부할 파일을 선택해주세요.'));
    const files = [];
    let total = 0;
    // Validate the whole selection before making local copies.
    for (const source of paths) {
      if (typeof source !== 'string' || !path.isAbsolute(source)) throw fail(uiText('첨부 파일 경로를 확인해주세요.'));
      const name = path.basename(source);
      if (!name || name.length > 240 || /[\x00-\x1f]/.test(name)) throw fail(uiText('첨부 파일 이름을 확인해주세요.'));
      const info = format(name, this.provider);
      const handle = await fs.open(source, 'r');
      let bytes;
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw fail(uiText('첨부할 파일을 확인해주세요.'));
        this.validateFileSize(info.kind, stat.size, total);
        bytes = await handle.readFile();
      } finally {
        await handle.close();
      }
      this.validateFileSize(info.kind, bytes.length, total);
      if (info.kind !== 'image') total += bytes.length;
      if (info.kind === 'image') validateImage(bytes, info.mime);
      if (info.kind === 'text') textContent(bytes);
      files.push({ id: randomUUID(), name, size: bytes.length, ...info, bytes });
    }
    const folder = await this.directory(scope);
    for (const file of files) {
      await fs.writeFile(await contained(this.root, path.join(folder, `${file.id}.${suffix(file)}`)), file.bytes, {
        flag: 'wx',
        mode: 0o600
      });
      await atomicJson(await contained(this.root, path.join(folder, `${file.id}.json`)), metadata(file), {
        exclusive: true
      });
    }
    return files.map(metadata);
  }
  async read(scope, selected = []) {
    if (!Array.isArray(selected)) throw fail(uiText('첨부 파일 목록이 올바르지 않습니다.'));
    if (!selected.length) return [];
    const folder = await this.directory(scope);
    const files = [];
    let total = 0;
    for (const item of selected) {
      if (!item || typeof item.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.id))
        throw fail(uiText('잘못된 첨부 파일입니다.'));
      let saved, bytes, filePath, info;
      try {
        const manifest = await contained(this.root, path.join(folder, `${item.id}.json`));
        if ((await fs.stat(manifest)).size > 4096) throw fail(uiText('첨부 파일 정보가 올바르지 않습니다.'));
        saved = JSON.parse(await fs.readFile(manifest, 'utf8'));
        if (
          saved.id !== item.id ||
          typeof saved.name !== 'string' ||
          saved.name !== path.basename(saved.name) ||
          saved.name.length > 240 ||
          /[\\\x00-\x1f]/.test(saved.name)
        )
          throw fail(uiText('첨부 파일 정보가 올바르지 않습니다.'));
        info = format(saved.name, this.provider);
        filePath = await contained(this.root, path.join(folder, `${item.id}.${suffix(info)}`));
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) throw fail(uiText('첨부할 파일을 확인해주세요.'));
        this.validateFileSize(info.kind, stat.size, total);
        bytes = await fs.readFile(filePath);
      } catch (error) {
        if (error.code === 'invalid_attachment') throw error;
        throw fail(uiText('이 계정의 첨부 파일을 읽지 못했습니다. 파일을 다시 첨부해주세요.'));
      }
      if (saved.id !== item.id || typeof saved.name !== 'string' || saved.size !== bytes.length)
        throw fail(uiText('첨부 파일 정보가 올바르지 않습니다.'));
      this.validateFileSize(info.kind, bytes.length, total);
      if (info.kind !== 'image') total += bytes.length;
      if (info.kind === 'image') validateImage(bytes, info.mime);
      files.push({ ...metadata(saved), ...info, bytes, path: filePath });
    }
    return files;
  }
  async responseMessage(scope, message) {
    const files = await this.read(scope, message.attachments);
    if (!files.length) return { role: message.role, content: message.text };
    return {
      role: message.role,
      content: [
        ...(message.text ? [{ type: 'input_text', text: message.text }] : []),
        ...files.map(file =>
          file.kind === 'image'
            ? { type: 'input_image', image_url: `data:${file.mime};base64,${file.bytes.toString('base64')}` }
            : {
                type: 'input_file',
                filename: file.name,
                file_data: `data:${file.mime};base64,${file.bytes.toString('base64')}`
              }
        )
      ]
    };
  }
}
module.exports = { ChatAttachments, extensions, metadata, textContent, CHATGPT_MAX_FILE_BYTES };
