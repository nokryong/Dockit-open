export const PDF_OUTPUT_PREFLIGHT_STATUSES = Object.freeze({
  READY: "ready",
  WARNING: "warning",
  BLOCKED: "blocked"
});

export const PDF_OUTPUT_PREFLIGHT_ISSUE_CODES = Object.freeze({
  OUTPUT_SURFACE_UNAVAILABLE: "output-surface-unavailable",
  NOTE_SEMANTIC_INVALID: "note-semantic-invalid",
  FOOTNOTE_LAYOUT_BLOCKED: "footnote-layout-blocked",
  TABLE_ROW_TOO_TALL: "table-row-too-tall",
  IMAGE_LOAD_FAILED: "image-load-failed",
  IMAGE_LOAD_PENDING: "image-load-pending",
  FONT_LOAD_FAILED: "font-load-failed",
  FONT_LOAD_PENDING: "font-load-pending",
  HORIZONTAL_OVERFLOW: "horizontal-overflow"
});

const ISSUE_CATALOG = Object.freeze({
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.OUTPUT_SURFACE_UNAVAILABLE]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.BLOCKED,
    title: "출력할 문서를 확인할 수 없음",
    message: "문서 편집기가 준비된 뒤 다시 시도해 주세요."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.NOTE_SEMANTIC_INVALID]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.BLOCKED,
    title: "각주·미주 구조 확인 필요",
    message: "참조와 본문이 안전하게 연결된 상태에서만 출력할 수 있습니다."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FOOTNOTE_LAYOUT_BLOCKED]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.BLOCKED,
    title: "각주 페이지 배치 준비 실패",
    message: "각주 페이지 배치를 다시 계산한 뒤 출력해 주세요."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.TABLE_ROW_TOO_TALL]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.BLOCKED,
    title: "한 페이지보다 큰 표 행",
    message: "잘릴 수 있는 표 행을 나누거나 내용을 줄인 뒤 출력해 주세요."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_FAILED]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.BLOCKED,
    title: "불러오지 못한 이미지",
    message: "이미지 원본을 다시 연결한 뒤 출력해 주세요."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_PENDING]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.WARNING,
    title: "불러오는 중인 이미지",
    message: "이미지가 출력에 포함되지 않을 수 있습니다."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FONT_LOAD_FAILED]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.WARNING,
    title: "불러오지 못한 글꼴",
    message: "대체 글꼴로 출력되어 줄바꿈이나 페이지 배치가 달라질 수 있습니다."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FONT_LOAD_PENDING]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.WARNING,
    title: "불러오는 중인 글꼴",
    message: "글꼴 로드가 끝나기 전에 출력하면 줄바꿈이나 페이지 배치가 달라질 수 있습니다."
  }),
  [PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.HORIZONTAL_OVERFLOW]: Object.freeze({
    severity: PDF_OUTPUT_PREFLIGHT_STATUSES.WARNING,
    title: "페이지 너비를 벗어난 내용",
    message: "표, 차트, 이미지 또는 긴 텍스트의 오른쪽이 잘릴 수 있습니다."
  })
});

const ISSUE_ORDER = Object.freeze([
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.OUTPUT_SURFACE_UNAVAILABLE,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.NOTE_SEMANTIC_INVALID,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FOOTNOTE_LAYOUT_BLOCKED,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.TABLE_ROW_TOO_TALL,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_FAILED,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_PENDING,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FONT_LOAD_FAILED,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FONT_LOAD_PENDING,
  PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.HORIZONTAL_OVERFLOW
]);

const OVERFLOW_CANDIDATE_SELECTOR = [
  "table",
  "figure",
  "pre",
  "img",
  "svg",
  "canvas",
  "[data-chart-block]"
].join(",");

const TABLE_ROW_TOO_TALL_SELECTOR = [
  ".tiptap-table-row-too-tall",
  "[data-table-row-too-tall-reason]"
].join(",");

const FOOTNOTE_BODY_SELECTOR =
  '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]';

const toCount = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};

const freezeList = (items) => Object.freeze([...items]);

const createIssue = (code, count) =>
  Object.freeze({
    code,
    count,
    ...ISSUE_CATALOG[code]
  });

export const createPdfOutputPreflightReport = (signals = {}) => {
  const issueCounts = new Map();
  const addIssue = (code, count) => {
    const normalizedCount = toCount(count);
    if (normalizedCount > 0) issueCounts.set(code, normalizedCount);
  };

  if (signals.surfaceAvailable !== true) {
    addIssue(PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.OUTPUT_SURFACE_UNAVAILABLE, 1);
  }
  if (signals.notePersistenceBlocked === true) {
    addIssue(PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.NOTE_SEMANTIC_INVALID, 1);
  }

  const footnotePrintState = `${signals.footnotePrintState ?? ""}`.trim();
  if (
    footnotePrintState === "blocked" ||
    (signals.hasFootnoteBodies === true && footnotePrintState !== "ready")
  ) {
    addIssue(PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FOOTNOTE_LAYOUT_BLOCKED, 1);
  }

  addIssue(
    PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.TABLE_ROW_TOO_TALL,
    signals.tableRowTooTallCount
  );
  addIssue(
    PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_FAILED,
    signals.failedImageCount
  );
  addIssue(
    PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.IMAGE_LOAD_PENDING,
    signals.pendingImageCount
  );
  addIssue(
    PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FONT_LOAD_FAILED,
    signals.failedFontCount
  );
  addIssue(
    PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.FONT_LOAD_PENDING,
    signals.pendingFontCount
  );
  addIssue(
    PDF_OUTPUT_PREFLIGHT_ISSUE_CODES.HORIZONTAL_OVERFLOW,
    signals.horizontalOverflowCount
  );

  const issues = freezeList(
    ISSUE_ORDER.filter((code) => issueCounts.has(code)).map((code) =>
      createIssue(code, issueCounts.get(code))
    )
  );
  const blockers = freezeList(
    issues.filter(
      ({ severity }) => severity === PDF_OUTPUT_PREFLIGHT_STATUSES.BLOCKED
    )
  );
  const warnings = freezeList(
    issues.filter(
      ({ severity }) => severity === PDF_OUTPUT_PREFLIGHT_STATUSES.WARNING
    )
  );
  const status = blockers.length > 0
    ? PDF_OUTPUT_PREFLIGHT_STATUSES.BLOCKED
    : warnings.length > 0
      ? PDF_OUTPUT_PREFLIGHT_STATUSES.WARNING
      : PDF_OUTPUT_PREFLIGHT_STATUSES.READY;

  return Object.freeze({
    status,
    canPrint: blockers.length === 0,
    requiresConfirmation: blockers.length === 0 && warnings.length > 0,
    issueCount: issues.reduce((total, issue) => total + issue.count, 0),
    issues,
    blockers,
    warnings
  });
};

const getScopedElements = (rootElement, selector) => {
  if (!rootElement?.querySelectorAll) return [];
  return Array.from(rootElement.querySelectorAll(selector));
};

const getFootnotePrintState = (rootElement) => {
  const directState = rootElement?.getAttribute?.(
    "data-dockit-footnote-print-state"
  );
  if (directState) return directState;

  const ancestorState = rootElement?.closest?.(
    "[data-dockit-footnote-print-state]"
  )?.getAttribute("data-dockit-footnote-print-state");
  if (ancestorState) return ancestorState;

  return rootElement
    ?.querySelector?.("[data-dockit-footnote-print-state]")
    ?.getAttribute("data-dockit-footnote-print-state") || "";
};

const collectImageSignals = (rootElement) => {
  let failedImageCount = 0;
  let pendingImageCount = 0;

  getScopedElements(rootElement, "img").forEach((image) => {
    if (image.complete !== true) {
      pendingImageCount += 1;
      return;
    }

    if (!(Number(image.naturalWidth) > 0)) {
      failedImageCount += 1;
    }
  });

  return { failedImageCount, pendingImageCount };
};

const collectFontSignals = (fontSet) => {
  let fontFaces = [];
  try {
    fontFaces = fontSet ? Array.from(fontSet) : [];
  } catch {
    fontFaces = [];
  }

  const failedFontCount = fontFaces.filter(
    (fontFace) => fontFace?.status === "error"
  ).length;
  const loadingFaceCount = fontFaces.filter(
    (fontFace) => fontFace?.status === "loading"
  ).length;
  const pendingFontCount = Math.max(
    loadingFaceCount,
    fontSet?.status === "loading" ? 1 : 0
  );

  return { failedFontCount, pendingFontCount };
};

const hasHorizontalOverflow = (element, tolerancePx) => {
  const clientWidth = Number(element?.clientWidth);
  const scrollWidth = Number(element?.scrollWidth);

  return (
    Number.isFinite(clientWidth) &&
    Number.isFinite(scrollWidth) &&
    clientWidth > 0 &&
    scrollWidth > clientWidth + tolerancePx
  );
};

const collectHorizontalOverflowCount = (rootElement, tolerancePx) => {
  if (!rootElement) return 0;

  const candidates = new Set([
    rootElement,
    ...getScopedElements(rootElement, OVERFLOW_CANDIDATE_SELECTOR)
  ]);

  return Array.from(candidates).filter((element) =>
    hasHorizontalOverflow(element, tolerancePx)
  ).length;
};

export const collectPdfOutputPreflightSignals = ({
  rootElement,
  fontSet = typeof document === "undefined" ? null : document.fonts,
  notePersistenceBlocked = false,
  overflowTolerancePx = 1
} = {}) => {
  const surfaceAvailable = Boolean(rootElement?.querySelectorAll);
  const footnotePrintState = getFootnotePrintState(rootElement);
  const hasFootnoteBodies = Boolean(
    rootElement?.querySelector?.(FOOTNOTE_BODY_SELECTOR)
  );
  const tableRowTooTallCount = getScopedElements(
    rootElement,
    TABLE_ROW_TOO_TALL_SELECTOR
  ).length;
  const imageSignals = collectImageSignals(rootElement);
  const fontSignals = collectFontSignals(fontSet);

  return Object.freeze({
    surfaceAvailable,
    notePersistenceBlocked: notePersistenceBlocked === true,
    footnotePrintState,
    hasFootnoteBodies,
    tableRowTooTallCount,
    horizontalOverflowCount: collectHorizontalOverflowCount(
      rootElement,
      Math.max(0, Number(overflowTolerancePx) || 0)
    ),
    ...imageSignals,
    ...fontSignals
  });
};

export const auditPdfOutputPreflight = (options = {}) => {
  const signals = collectPdfOutputPreflightSignals(options);
  return createPdfOutputPreflightReport(signals);
};

export const getPdfOutputPreflightIssueSignature = (report) =>
  JSON.stringify(
    Array.isArray(report?.issues)
      ? report.issues.map(({ code, count, severity }) => ({
          code,
          count,
          severity
        }))
      : []
  );

export const PDF_OUTPUT_PREFLIGHT_ISSUE_CATALOG = ISSUE_CATALOG;
