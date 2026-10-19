import { t as uiText } from "../i18n";
import { getWarningCatalogEntry, pickWarningCatalogEntries } from "../ir/warningCatalog.js";

export const HWPX_V0_MIME_TYPE = "application/hwp+zip";
export const HWPX_V0_EXPORT_ERROR_MESSAGE =
  "HWPX 내보내기에 실패했습니다. 문서를 저장하거나 새로고침한 뒤 다시 시도해 주세요.";
const RESERVED_WINDOWS_FILE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export const HWPX_V0_WARNING_DETAIL_COPY = pickWarningCatalogEntries([
  "run-style-fallback",
  "link-attribute-fallback",
  "link-target-fallback",
  "list-marker-text-fallback",
  "task-list-fallback",
  "nested-list-fallback",
  "table-border-metadata-only",
  "table-border-style-fallback",
  "table-merge-layout-warning",
  "paragraph-line-spacing-fallback",
  "paragraph-tabs-fallback",
  "paragraph-style-fallback",
  "object-placeholder",
  "semantic-block-fallback",
  "unsupported-block",
  "unsupported-nested-block",
  "ir-extraction-warning"
], {
  surface: "hwpxExport"
});

const HWPX_V0_WARNING_SEVERITY_LABELS = Object.freeze({
  get warning() { return uiText("확인 필요"); },
  get blocked() { return uiText("제한됨"); }
});

const HWPX_V0_BLOCK_TYPE_LABELS = Object.freeze({
  get paragraph() { return uiText("문단"); },
  heading: "제목",
  get list() { return uiText("목록"); },
  get table() { return uiText("표"); },
  get object() { return uiText("이미지/객체"); },
  get unsupported() { return uiText("지원하지 않는 블록"); },
  section: "섹션",
  get document() { return uiText("문서"); }
});

const DEFAULT_PAGE_SETTINGS = Object.freeze({
  widthMm: 210,
  heightMm: 297,
  paddingTopMm: 25,
  paddingBottomMm: 25,
  paddingLeftMm: 25,
  paddingRightMm: 25,
  lineHeight: 1.5
});

const toFiniteNumber = (value, fallback, { allowZero = false } = {}) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed > 0 || (allowZero && parsed === 0)) {
    return parsed;
  }

  return fallback;
};

export const createHWPXV0PageSettingsFromDocSetting = (docSetting) => ({
  widthMm: toFiniteNumber(docSetting?.pageWidth, DEFAULT_PAGE_SETTINGS.widthMm),
  heightMm: toFiniteNumber(docSetting?.pageHeight, DEFAULT_PAGE_SETTINGS.heightMm),
  paddingTopMm: toFiniteNumber(
    docSetting?.paddingTop,
    DEFAULT_PAGE_SETTINGS.paddingTopMm,
    { allowZero: true }
  ),
  paddingBottomMm: toFiniteNumber(
    docSetting?.paddingBottom,
    DEFAULT_PAGE_SETTINGS.paddingBottomMm,
    { allowZero: true }
  ),
  paddingLeftMm: toFiniteNumber(
    docSetting?.paddingLeft,
    DEFAULT_PAGE_SETTINGS.paddingLeftMm,
    { allowZero: true }
  ),
  paddingRightMm: toFiniteNumber(
    docSetting?.paddingRight,
    DEFAULT_PAGE_SETTINGS.paddingRightMm,
    { allowZero: true }
  ),
  lineHeight: toFiniteNumber(docSetting?.lineHeight, DEFAULT_PAGE_SETTINGS.lineHeight)
});

export const sanitizeHWPXV0FileName = (title, fallback = uiText("문서")) => {
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

export const createHWPXV0DownloadFileName = (title) => {
  const sanitized = sanitizeHWPXV0FileName(title);
  const withoutExtension = sanitized.replace(/\.hwpx$/i, "").replace(/[. ]+$/g, "");
  const safeBase =
    withoutExtension && !RESERVED_WINDOWS_FILE_NAME.test(withoutExtension)
      ? withoutExtension
      : uiText("문서");

  return `${safeBase}.hwpx`;
};

export const isHWPXV0PackageBytes = (packageBytes) =>
  packageBytes instanceof Uint8Array &&
  packageBytes.length >= 4 &&
  packageBytes[0] === 0x50 &&
  packageBytes[1] === 0x4b &&
  packageBytes[2] === 0x03 &&
  packageBytes[3] === 0x04;

export const buildHWPXV0ExportNotice = ({
  hwpxWarningSummary,
  irWarningCount = 0
} = {}) => {
  const writerWarningTotal = Number(hwpxWarningSummary?.total ?? 0);
  const blockedCount = Number(hwpxWarningSummary?.blockedCount ?? 0);
  const total = writerWarningTotal + Number(irWarningCount || 0);
  const visiblePlaceholderCount = (hwpxWarningSummary?.items || []).reduce(
    (sum, item) => sum + (item.visiblePlaceholder ? item.count || 0 : 0),
    0
  );

  if (total <= 0) {
    return {
      toastType: "success",
      message: uiText("HWPX v0 파일을 다운로드했습니다.")
    };
  }

  if (blockedCount > 0 || visiblePlaceholderCount > 0) {
    return {
      toastType: "warning",
      message: uiText("HWPX v0 파일을 다운로드했습니다. 일부 내용은 자리표시자로 보일 수 있습니다. ({0}개 항목)", total)
    };
  }

  return {
    toastType: "info",
    message: uiText("HWPX v0 파일을 다운로드했습니다. 일부 서식은 단순화될 수 있습니다. ({0}개 항목)", total)
  };
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const getWarningCopy = (code) =>
  getWarningCatalogEntry(code, { surface: "hwpxExport" });

const toDisplayIndex = (value) =>
  Number.isInteger(value) && value >= 0 ? value + 1 : null;

const getBlockTypeLabel = (blockType) =>
  HWPX_V0_BLOCK_TYPE_LABELS[blockType] || blockType || "알 수 없는 블록";

const createAffectedBlockDetail = (warning) => {
  const sectionNumber = toDisplayIndex(warning?.sectionIndex);
  const blockNumber = toDisplayIndex(warning?.blockIndex);
  const blockTypeLabel = getBlockTypeLabel(warning?.blockType);
  const sectionLabel = sectionNumber ? uiText("{0}번째 섹션", sectionNumber) : uiText("문서");
  const blockLabel = blockNumber ? uiText("{0}번째 블록", blockNumber) : uiText("섹션 정보");

  return {
    label: `${sectionLabel} · ${blockLabel}`,
    blockType: warning?.blockType || "document",
    blockTypeLabel,
    path: warning?.path || "",
    message: warning?.message || ""
  };
};

const createIrWarningDetail = (message, index) => ({
  label: uiText("문서 변환 단계 · {0}번째 경고", index + 1),
  blockType: "document",
  blockTypeLabel: uiText("편집기 구조"),
  path: "",
  message: `${message || ""}`
});

const compareWarningGroups = (a, b) => {
  if (a.severity !== b.severity) {
    return a.severity === "blocked" ? -1 : 1;
  }

  return a.title.localeCompare(b.title, "ko");
};

export const createHWPXV0WarningDetails = ({
  hwpxWarnings,
  hwpxWarningSummary,
  irWarnings
} = {}) => {
  const groups = new Map();
  const summaryItems = asArray(hwpxWarningSummary?.items);

  const ensureGroup = (code, severity = "warning") => {
    const key = `${code}:${severity}`;
    const copy = getWarningCopy(code);

    if (!groups.has(key)) {
      groups.set(key, {
        code,
        title: copy.title,
        severity,
        severityLabel: HWPX_V0_WARNING_SEVERITY_LABELS[severity] || "확인 필요",
        description: copy.description,
        fallback: copy.fallback,
        count: 0,
        affectedBlocks: []
      });
    }

    return groups.get(key);
  };

  asArray(hwpxWarnings).forEach((warning) => {
    const code = warning?.code || "unknown-warning";
    const severity = warning?.severity === "blocked" ? "blocked" : "warning";
    const group = ensureGroup(code, severity);

    group.count += 1;
    group.affectedBlocks.push(createAffectedBlockDetail(warning));
  });

  summaryItems.forEach((item) => {
    const code = item?.code || "unknown-warning";
    const severity = item?.severity === "blocked" ? "blocked" : "warning";
    const group = ensureGroup(code, severity);

    if (group.count <= 0) {
      group.count = Number(item?.count || 0);
    }
  });

  const irWarningMessages = asArray(irWarnings)
    .map((warning) => `${warning || ""}`.trim())
    .filter(Boolean);

  if (irWarningMessages.length > 0) {
    const group = ensureGroup("ir-extraction-warning", "warning");

    group.count += irWarningMessages.length;
    group.affectedBlocks.push(
      ...irWarningMessages.map((message, index) =>
        createIrWarningDetail(message, index)
      )
    );
  }

  const detailGroups = Array.from(groups.values())
    .filter((group) => group.count > 0)
    .sort(compareWarningGroups)
    .map((group) => Object.freeze({
      ...group,
      affectedBlocks: Object.freeze(group.affectedBlocks)
    }));
  const total = detailGroups.reduce((sum, group) => sum + group.count, 0);

  return Object.freeze({
    hasWarnings: total > 0,
    total,
    groups: Object.freeze(detailGroups)
  });
};
