import { validateSemanticHtmlPayload } from "./semanticAttributes";

export const DKT_SCHEMA_VERSION = 1;
export const DKT_SEMANTIC_SCHEMA_VERSION = 2;
export const DKT_MAX_SCHEMA_VERSION = DKT_SEMANTIC_SCHEMA_VERSION;
export const MAX_DKT_BYTES = 52_428_800;
export const DOCKIT_DOCUMENT_FILE_TYPES = new Set([
  "dkt-document",
  "dockit-document"
]);

const SUPPORTED_PAGE_NUMBERS = new Set(["none", "center", "left", "right"]);

const isPlainObject = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeFocus = (value) =>
  Number.isInteger(value) && value >= 0 ? value : null;

const normalizeSourceFileName = (value) => {
  if (typeof value !== "string") return "";
  return value.slice(0, 1024);
};

const normalizeTitle = (value) => {
  const title = typeof value === "string" ? value.slice(0, 500) : "";
  return title.trim() || "문서";
};

const assertCurrentSchema = (data) => {
  if (typeof data.title !== "string" || data.title.length > 500) {
    throw new Error("Dockit 문서 제목이 올바르지 않습니다.");
  }
  if (typeof data.content !== "string") {
    throw new Error("Dockit 문서 본문이 올바르지 않습니다.");
  }
  if (!isPlainObject(data.docSetting) || !isPlainObject(data.bulletStyle)) {
    throw new Error("Dockit 문서 설정이 올바르지 않습니다.");
  }
  if (typeof data.viewPage !== "boolean") {
    throw new Error("Dockit 페이지 보기 설정이 올바르지 않습니다.");
  }
  if (!SUPPORTED_PAGE_NUMBERS.has(data.pageNumber)) {
    throw new Error("Dockit 쪽 번호 설정이 올바르지 않습니다.");
  }
  if (data.focus !== null && normalizeFocus(data.focus) === null) {
    throw new Error("Dockit 커서 위치가 올바르지 않습니다.");
  }
};

export const normalizeDockitDocumentForImport = (data) => {
  if (!isPlainObject(data)) {
    throw new Error("Dockit 문서가 JSON 객체가 아닙니다.");
  }
  if (!DOCKIT_DOCUMENT_FILE_TYPES.has(data.fileType)) {
    throw new Error("잘못된 Dockit 파일 형식입니다.");
  }

  const schemaVersion = data.schemaVersion ?? 0;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error("Dockit schema version이 올바르지 않습니다.");
  }
  if (schemaVersion > DKT_MAX_SCHEMA_VERSION) {
    throw new Error(
      `이 앱이 지원하지 않는 Dockit schema version입니다: ${schemaVersion}`
    );
  }
  if (
    schemaVersion === DKT_SCHEMA_VERSION ||
    schemaVersion === DKT_SEMANTIC_SCHEMA_VERSION
  ) {
    assertCurrentSchema(data);
  }
  const semanticPayload = validateSemanticHtmlPayload(data.content);
  if (
    (schemaVersion < DKT_SEMANTIC_SCHEMA_VERSION &&
      semanticPayload.hasSemanticData) ||
    (schemaVersion === DKT_SEMANTIC_SCHEMA_VERSION &&
      (!semanticPayload.valid || !semanticPayload.hasSemanticData))
  ) {
    throw new Error("Dockit 의미 정보가 올바르지 않습니다.");
  }

  const normalized = {
    title: normalizeTitle(data.title),
    content: typeof data.content === "string" ? data.content : "",
    docSetting: isPlainObject(data.docSetting) ? data.docSetting : {},
    bulletStyle: isPlainObject(data.bulletStyle) ? data.bulletStyle : {},
    viewPage: typeof data.viewPage === "boolean" ? data.viewPage : false,
    pageNumber: SUPPORTED_PAGE_NUMBERS.has(data.pageNumber)
      ? data.pageNumber
      : "none",
    focus: normalizeFocus(data.focus)
  };
  const sourceFileName = normalizeSourceFileName(data.sourceFileName);
  if (sourceFileName) {
    normalized.sourceFileName = sourceFileName;
  }

  return normalized;
};

export const createDockitDocumentSnapshot = ({
  document = {},
  title = document?.title,
  content = document?.content,
  docSetting = document?.docSetting,
  bulletStyle = document?.bulletStyle,
  viewPage = document?.viewPage,
  pageNumber = document?.pageNumber,
  focus = document?.focus
} = {}) => {
  const snapshot = {
    fileType: "dkt-document",
    schemaVersion: DKT_SCHEMA_VERSION,
    title: normalizeTitle(title),
    content: typeof content === "string" ? content : "",
    docSetting: isPlainObject(docSetting) ? docSetting : {},
    bulletStyle: isPlainObject(bulletStyle) ? bulletStyle : {},
    viewPage: Boolean(viewPage),
    pageNumber: SUPPORTED_PAGE_NUMBERS.has(pageNumber) ? pageNumber : "none",
    focus: normalizeFocus(focus)
  };
  const semanticPayload = validateSemanticHtmlPayload(snapshot.content);
  if (!semanticPayload.valid) {
    throw new Error("Dockit 의미 정보가 올바르지 않습니다.");
  }
  if (semanticPayload.hasSemanticData) {
    snapshot.schemaVersion = DKT_SEMANTIC_SCHEMA_VERSION;
  }
  const sourceFileName = normalizeSourceFileName(document?.sourceFileName);
  if (sourceFileName) {
    snapshot.sourceFileName = sourceFileName;
  }

  return snapshot;
};

export const getCreatedDockitDocumentId = (response) => {
  const createdDocument = response?.content || response;
  const documentId = `${createdDocument?._id || ""}`.trim();
  return documentId;
};

export const validateDockitImportFile = (file) => {
  if (!file) {
    return { valid: false, message: "Dockit 파일을 선택해 주세요." };
  }
  if (Number(file.size) > MAX_DKT_BYTES) {
    return {
      valid: false,
      message: "50MB를 초과하는 Dockit 문서는 불러올 수 없습니다."
    };
  }
  return { valid: true, message: "" };
};
