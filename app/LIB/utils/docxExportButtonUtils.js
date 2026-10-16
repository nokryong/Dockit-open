import {
  WARNING_CATALOG_DEFAULT_ENTRY,
  getWarningCatalogEntry,
  pickWarningCatalogEntries
} from "../ir/warningCatalog.js";

export const DOCX_V0_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOCX_V0_EXPORT_ERROR_MESSAGE =
  "DOCX 내보내기에 실패했습니다. 문서를 확인한 뒤 다시 시도해 주세요.";

const RESERVED_WINDOWS_FILE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const DOCX_V0_WARNING_COPY = pickWarningCatalogEntries([
  "docx-run-style-fallback",
  "docx-link-target-fallback",
  "docx-link-attribute-fallback",
  "docx-list-fallback",
  "docx-paragraph-style-fallback",
  "docx-image-relationship-fallback",
  "docx-object-placeholder",
  "docx-table-style-fallback",
  "docx-table-border-fallback",
  "docx-table-fill-fallback",
  "docx-unsupported-block",
  "ir-extraction-warning"
], {
  surface: "docxExport"
});

const DOCX_V0_DEFAULT_WARNING_COPY = WARNING_CATALOG_DEFAULT_ENTRY;

const BLOCK_TYPE_LABELS = Object.freeze({
  paragraph: "문단",
  heading: "제목",
  list: "목록",
  table: "표",
  object: "객체",
  unsupported: "미지원 블록",
  section: "섹션",
  document: "문서"
});

const SEVERITY_LABELS = Object.freeze({
  warning: "확인 필요",
  blocked: "제한됨"
});

export const sanitizeDOCXV0FileName = (title, fallback = "문서") => {
  const baseName = `${title ?? ""}`.trim() || fallback;
  const sanitized = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 120)
    .trim();

  if (!sanitized || RESERVED_WINDOWS_FILE_NAME.test(sanitized)) {
    return fallback;
  }

  return sanitized;
};

export const createDOCXV0DownloadFileName = (title) => {
  const sanitized = sanitizeDOCXV0FileName(title);
  const withoutExtension = sanitized.replace(/\.docx$/i, "").replace(/[. ]+$/g, "");
  const safeBase =
    withoutExtension && !RESERVED_WINDOWS_FILE_NAME.test(withoutExtension)
      ? withoutExtension
      : "문서";

  return `${safeBase}.docx`;
};

export const isDOCXV0PackageBytes = (packageBytes) =>
  packageBytes instanceof Uint8Array &&
  packageBytes.length >= 4 &&
  packageBytes[0] === 0x50 &&
  packageBytes[1] === 0x4b &&
  packageBytes[2] === 0x03 &&
  packageBytes[3] === 0x04;

export const startDOCXV0Export = (inFlightRef) => {
  if (!inFlightRef || typeof inFlightRef !== "object") {
    return false;
  }

  if (inFlightRef.current) {
    return false;
  }

  inFlightRef.current = true;
  return true;
};

export const finishDOCXV0Export = (inFlightRef) => {
  if (inFlightRef && typeof inFlightRef === "object") {
    inFlightRef.current = false;
  }
};

const getWarningCopy = (code) =>
  getWarningCatalogEntry(code, { surface: "docxExport" }) || DOCX_V0_DEFAULT_WARNING_COPY;

export const summarizeDOCXV0Warnings = (warnings = []) => {
  const grouped = new Map();

  warnings.forEach((warning) => {
    const code = warning?.code || "docx-unknown-warning";
    const severity =
      warning?.severity === "blocked" || warning?.severity === "error"
        ? "blocked"
        : "warning";
    const copy = getWarningCopy(code);
    const existing = grouped.get(code);

    if (existing) {
      existing.count += 1;
      return;
    }

    grouped.set(code, {
      code,
      severity,
      count: 1,
      fallback: copy.fallback,
      visiblePlaceholder: copy.visiblePlaceholder,
      firstMessage: warning?.message || ""
    });
  });

  const items = Array.from(grouped.values()).sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "blocked" ? -1 : 1;
    }

    return a.code.localeCompare(b.code);
  });

  return Object.freeze({
    total: items.reduce((sum, item) => sum + item.count, 0),
    warningCount: items
      .filter((item) => item.severity === "warning")
      .reduce((sum, item) => sum + item.count, 0),
    blockedCount: items
      .filter((item) => item.severity === "blocked")
      .reduce((sum, item) => sum + item.count, 0),
    items: Object.freeze(items.map((item) => Object.freeze(item)))
  });
};

export const buildDOCXV0ExportNotice = ({
  warningSummary,
  irWarningCount = 0
} = {}) => {
  const writerWarningTotal = Number(warningSummary?.total || 0);
  const blockedCount = Number(warningSummary?.blockedCount || 0);
  const total = writerWarningTotal + Number(irWarningCount || 0);
  const visiblePlaceholderCount = (warningSummary?.items || []).reduce(
    (sum, item) => sum + (item.visiblePlaceholder ? item.count || 0 : 0),
    0
  );

  if (total <= 0) {
    return {
      toastType: "success",
      message: "DOCX 파일을 다운로드했습니다."
    };
  }

  if (blockedCount > 0 || visiblePlaceholderCount > 0) {
    return {
      toastType: "warning",
      message: `DOCX 파일을 다운로드했습니다. 일부 내용은 자리표시자나 단순화된 형태로 보일 수 있습니다. (${total}개 항목)`
    };
  }

  return {
    toastType: "info",
    message: `DOCX 파일을 다운로드했습니다. 일부 서식은 Word에서 단순화되어 보일 수 있습니다. (${total}개 항목)`
  };
};

const createAffectedBlockDetail = (warning) => {
  const blockType = warning?.blockType || warning?.metadata?.blockType || "document";
  const blockId = warning?.blockId || warning?.metadata?.blockId || "";
  const path = warning?.path || warning?.metadata?.path || "";
  const message = warning?.message || "";

  return Object.freeze({
    label: blockId ? `블록 ${blockId}` : "문서 전체",
    blockType,
    blockTypeLabel: BLOCK_TYPE_LABELS[blockType] || blockType,
    path,
    message
  });
};

const createIrWarningDetail = (warning) =>
  Object.freeze({
    label: warning?.blockId ? `블록 ${warning.blockId}` : "IR 변환",
    blockType: warning?.blockType || "document",
    blockTypeLabel:
      BLOCK_TYPE_LABELS[warning?.blockType] || warning?.blockType || "문서",
    path: warning?.path || "",
    message: warning?.message || warning?.code || ""
  });

const makeWarningGroup = ({ code, severity, copy, count, affectedBlocks }) =>
  Object.freeze({
    code,
    severity,
    severityLabel: SEVERITY_LABELS[severity] || "확인 필요",
    title: copy.title,
    description: copy.description,
    fallback: copy.fallback,
    count,
    affectedBlocks: Object.freeze(affectedBlocks)
  });

export const createDOCXV0WarningDetails = ({
  docxWarnings = [],
  docxWarningSummary,
  irWarnings = []
} = {}) => {
  const grouped = new Map();

  docxWarnings.forEach((warning) => {
    const code = warning?.code || "docx-unknown-warning";
    const severity =
      warning?.severity === "blocked" || warning?.severity === "error"
        ? "blocked"
        : "warning";
    const key = `${severity}:${code}`;
    const copy = getWarningCopy(code);
    const existing = grouped.get(key);

    if (existing) {
      existing.count += 1;
      existing.affectedBlocks.push(createAffectedBlockDetail(warning));
      return;
    }

    grouped.set(key, {
      code,
      severity,
      copy,
      count: 1,
      affectedBlocks: [createAffectedBlockDetail(warning)]
    });
  });

  (docxWarningSummary?.items || []).forEach((item) => {
    const severity =
      item?.severity === "blocked" || item?.severity === "error"
        ? "blocked"
        : "warning";
    const code = item?.code || "docx-unknown-warning";
    const key = `${severity}:${code}`;

    if (grouped.has(key)) {
      return;
    }

    grouped.set(key, {
      code,
      severity,
      copy: getWarningCopy(code),
      count: Number(item?.count || 0),
      affectedBlocks: []
    });
  });

  if (Array.isArray(irWarnings) && irWarnings.length > 0) {
    grouped.set("warning:ir-extraction-warning", {
      code: "ir-extraction-warning",
      severity: "warning",
      copy: getWarningCopy("ir-extraction-warning"),
      count: irWarnings.length,
      affectedBlocks: irWarnings.map(createIrWarningDetail)
    });
  }

  const groups = Array.from(grouped.values())
    .filter((group) => group.count > 0)
    .map(makeWarningGroup)
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "blocked" ? -1 : 1;
      }

      return a.title.localeCompare(b.title);
    });

  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return Object.freeze({
    hasWarnings: total > 0,
    total,
    groups: Object.freeze(groups)
  });
};
