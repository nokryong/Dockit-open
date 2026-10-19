const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const isRecord = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isRemoteImageSrc = (src) => typeof src === "string" && /^https?:\/\//i.test(src);

const normalizeImageMimeType = (value) => {
  const mimeType = `${value || ""}`.split(";")[0].trim().toLowerCase();

  if (mimeType === "image/jpg") {
    return "image/jpeg";
  }

  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) ? mimeType : null;
};

const sniffImageMimeType = (bytes) => {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  return null;
};

const getExtensionForMimeType = (mimeType) =>
  mimeType === "image/jpeg" ? "jpg" : "png";

const sanitizeFileNameBase = (value, fallback) => {
  const base = `${value || fallback}`
    .split(/[\\/]/)
    .pop()
    ?.split("?")[0]
    ?.split("#")[0]
    ?.replace(/\.[A-Za-z0-9]+$/, "")
    ?.replace(/[^A-Za-z0-9._-]/g, "_")
    ?.replace(/^[._-]+|[._-]+$/g, "");

  return base || fallback;
};

const inferFileNameFromUrl = (src, mimeType, fallbackBase = "image") => {
  let pathname = "";

  try {
    pathname = new URL(src).pathname;
  } catch {
    pathname = src;
  }

  return `${sanitizeFileNameBase(pathname, fallbackBase)}.${getExtensionForMimeType(
    mimeType
  )}`;
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
};

const fetchImageAsDataUri = async (
  src,
  { fetchImpl, maxBytes = DEFAULT_MAX_IMAGE_BYTES } = {}
) => {
  const effectiveFetch = fetchImpl ?? globalThis.fetch;

  if (typeof effectiveFetch !== "function") {
    return null;
  }

  try {
    const response = await effectiveFetch(src);

    if (!response?.ok || typeof response.arrayBuffer !== "function") {
      return null;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (!bytes.length || bytes.length > maxBytes) {
      return null;
    }

    const sniffedMimeType = sniffImageMimeType(bytes);
    const headerMimeType = normalizeImageMimeType(response.headers?.get?.("content-type"));
    const mimeType = sniffedMimeType ?? headerMimeType;

    if (!mimeType) {
      return null;
    }

    return {
      src,
      mimeType,
      dataUri: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
      fileName: inferFileNameFromUrl(src, mimeType)
    };
  } catch {
    return null;
  }
};

const resolveObjectBlock = async (block, cache, options) => {
  if (block.objectType !== "image" || !isRecord(block.attrs)) {
    return block;
  }

  const src = block.attrs.src;

  if (!isRemoteImageSrc(src)) {
    return block;
  }

  if (!cache.has(src)) {
    cache.set(src, fetchImageAsDataUri(src, options));
  }

  const resolved = await cache.get(src);

  if (!resolved) {
    return block;
  }

  return {
    ...block,
    attrs: {
      ...block.attrs,
      src: resolved.dataUri,
      mimeType: resolved.mimeType,
      fileName:
        typeof block.attrs.fileName === "string" && block.attrs.fileName.trim()
          ? block.attrs.fileName
          : resolved.fileName
    }
  };
};

const resolveBlock = async (block, cache, options) => {
  if (!isRecord(block)) {
    return block;
  }

  if (block.type === "object") {
    const resolvedObject = await resolveObjectBlock(block, cache, options);

    if (!Array.isArray(resolvedObject.children)) {
      return resolvedObject;
    }

    return {
      ...resolvedObject,
      children: await resolveBlocks(resolvedObject.children, cache, options)
    };
  }

  if (block.type === "list" && Array.isArray(block.items)) {
    return {
      ...block,
      items: await Promise.all(
        block.items.map(async (item) => ({
          ...item,
          blocks: Array.isArray(item.blocks)
            ? await resolveBlocks(item.blocks, cache, options)
            : item.blocks
        }))
      )
    };
  }

  if (block.type === "table" && Array.isArray(block.rows)) {
    return {
      ...block,
      rows: await Promise.all(
        block.rows.map(async (row) => ({
          ...row,
          cells: Array.isArray(row.cells)
            ? await Promise.all(
                row.cells.map(async (cell) => ({
                  ...cell,
                  blocks: Array.isArray(cell.blocks)
                    ? await resolveBlocks(cell.blocks, cache, options)
                    : cell.blocks
                }))
              )
            : row.cells
        }))
      )
    };
  }

  return block;
};

const resolveBlocks = (blocks, cache, options) =>
  Promise.all(blocks.map((block) => resolveBlock(block, cache, options)));

export const resolveHWPXV0RemoteImageSources = async (irDocument, options = {}) => {
  if (!isRecord(irDocument) || !Array.isArray(irDocument.sections)) {
    return irDocument;
  }

  const cache = new Map();
  const sections = await Promise.all(
    irDocument.sections.map(async (section) => ({
      ...section,
      blocks: Array.isArray(section.blocks)
        ? await resolveBlocks(section.blocks, cache, options)
        : section.blocks
    }))
  );

  return {
    ...irDocument,
    sections
  };
};

export const __HWPXV0_REMOTE_IMAGE_RESOLVER_TESTS__ = Object.freeze({
  fetchImageAsDataUri,
  sniffImageMimeType
});
