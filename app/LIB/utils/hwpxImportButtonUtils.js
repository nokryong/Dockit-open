import { t as uiText } from "../i18n";
import { inflateSync } from "fflate";

export const HWPX_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

export const HWPX_IMPORT_ERROR_MESSAGE =
  "HWPX 불러오기에 실패했습니다. 파일을 확인한 뒤 다시 시도해 주세요.";
export const HWPX_IMPORT_DEFLATE_ERROR_MESSAGE =
  "압축된 HWPX 항목을 해제하지 못했습니다. 파일이 손상되었거나 아직 지원하지 않는 압축 구조일 수 있습니다.";

const asArray = (value) => (Array.isArray(value) ? value : []);

export const createHWPXBrowserInflateRaw = () => (bytes, entryPath = "") => {
  try {
    return inflateSync(bytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${HWPX_IMPORT_DEFLATE_ERROR_MESSAGE}${
        entryPath ? ` (${entryPath})` : ""
      }${detail ? `: ${detail}` : ""}`
    );
  }
};

export const isHWPXImportFileName = (fileName) =>
  typeof fileName === "string" && /\.hwpx$/i.test(fileName.trim());

export const validateHWPXImportFile = (
  file,
  { maxBytes = HWPX_IMPORT_MAX_BYTES } = {}
) => {
  const fileName = `${file?.name ?? ""}`.trim();
  const size = Number(file?.size ?? 0);

  if (!fileName) {
    return {
      valid: false,
      code: "hwpx-import-file-missing",
      message: uiText("불러올 HWPX 파일을 선택해 주세요.")
    };
  }

  if (!isHWPXImportFileName(fileName)) {
    return {
      valid: false,
      code: "hwpx-import-file-extension",
      message: uiText("HWPX 파일(.hwpx)만 불러올 수 있습니다.")
    };
  }

  if (!Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      code: "hwpx-import-file-empty",
      message: uiText("빈 HWPX 파일은 불러올 수 없습니다.")
    };
  }

  if (size > maxBytes) {
    return {
      valid: false,
      code: "hwpx-import-file-too-large",
      message: uiText("HWPX 파일은 최대 {0}MB까지 불러올 수 있습니다.", Math.floor(maxBytes / 1024 / 1024))
    };
  }

  return {
    valid: true,
    code: "hwpx-import-file-ok",
    message: uiText("HWPX 파일을 dry-run할 수 있습니다.")
  };
};

export const startHWPXImportDryRun = (inFlightRef) => {
  if (!inFlightRef || typeof inFlightRef !== "object") {
    return false;
  }

  if (inFlightRef.current) {
    return false;
  }

  inFlightRef.current = true;
  return true;
};

export const finishHWPXImportDryRun = (inFlightRef) => {
  if (inFlightRef && typeof inFlightRef === "object") {
    inFlightRef.current = false;
  }
};

const countIRBlocks = (irDocument) =>
  asArray(irDocument?.sections).reduce(
    (sum, section) => sum + asArray(section?.blocks).length,
    0
  );

const collectIRText = (value) => {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  const parts = [];

  if (Array.isArray(value.runs)) {
    parts.push(...value.runs.map(collectIRText));
  }

  if (Array.isArray(value.items)) {
    parts.push(...value.items.map(collectIRText));
  }

  if (Array.isArray(value.blocks)) {
    parts.push(...value.blocks.map(collectIRText));
  }

  if (Array.isArray(value.rows)) {
    parts.push(...value.rows.map(collectIRText));
  }

  if (Array.isArray(value.cells)) {
    parts.push(...value.cells.map(collectIRText));
  }

  if (Array.isArray(value.sections)) {
    parts.push(...value.sections.map(collectIRText));
  }

  return parts.join(" ");
};

const collectIRFeatureFlags = (value, flags = {}) => {
  if (!value || typeof value !== "object") {
    return flags;
  }

  if (value.type === "table") {
    flags.hasTable = true;
  }

  if (value.type === "list") {
    flags.hasList = true;
  }

  if (value.type === "object" && value.objectType === "image") {
    flags.hasImage = true;
  }

  if (
    Array.isArray(value.marks) &&
    value.marks.some((mark) => mark?.type === "link")
  ) {
    flags.hasLink = true;
  }

  [
    "sections",
    "blocks",
    "runs",
    "items",
    "rows",
    "cells",
    "content"
  ].forEach((key) => {
    if (Array.isArray(value[key])) {
      value[key].forEach((child) => collectIRFeatureFlags(child, flags));
    }
  });

  return flags;
};

const toFeatureLabels = (flags) =>
  [
    flags.hasTable ? uiText("표") : null,
    flags.hasImage ? uiText("이미지") : null,
    flags.hasLink ? uiText("링크") : null,
    flags.hasList ? uiText("목록") : null
  ].filter(Boolean);

export const createHWPXImportDryRunSummary = ({
  fileName,
  importResult,
  projection,
  validation
} = {}) => {
  const importWarnings = asArray(importResult?.warnings);
  const projectionWarnings = asArray(projection?.warnings);
  const validationWarnings = asArray(validation?.warnings);
  const validationErrors = asArray(validation?.errors);
  const lossEntries = asArray(importResult?.lossReport?.entries);
  const importErrorCount = importWarnings.filter(
    (warning) => warning?.severity === "error"
  ).length;
  const lossErrorCount =
    Number(importResult?.lossReport?.summary?.errorCount ?? 0) ||
    lossEntries.filter((entry) => entry?.severity === "error").length;
  const text = collectIRText(importResult?.irDocument).replace(/\s+/g, " ").trim();
  const featureFlags = collectIRFeatureFlags(importResult?.irDocument);
  const validationValid = validation?.valid === true;

  return Object.freeze({
    fileName: `${fileName ?? ""}`.trim() || "선택한 HWPX",
    canApply: validationValid && importErrorCount === 0 && lossErrorCount === 0,
    validationValid,
    blockCount: countIRBlocks(importResult?.irDocument),
    textPreview: text.slice(0, 160),
    textLength: text.length,
    importWarningCount: importWarnings.length,
    importErrorCount,
    lossCount: Number(importResult?.lossReport?.summary?.total ?? lossEntries.length),
    lossErrorCount,
    projectionWarningCount: projectionWarnings.length,
    validationWarningCount: validationWarnings.length,
    validationErrorCount: validationErrors.length,
    packageEntryCount: Number(importResult?.packageSummary?.entryCount ?? 0),
    sectionCount: Number(importResult?.packageSummary?.sectionCount ?? 0),
    hasTable: Boolean(featureFlags.hasTable),
    hasImage: Boolean(featureFlags.hasImage),
    hasLink: Boolean(featureFlags.hasLink),
    hasList: Boolean(featureFlags.hasList),
    featureLabels: Object.freeze(toFeatureLabels(featureFlags))
  });
};

export const createHWPXImportPreview = ({
  file,
  importResult,
  projection,
  validation
} = {}) => {
  const summary = createHWPXImportDryRunSummary({
    fileName: file?.name,
    importResult,
    projection,
    validation
  });

  return Object.freeze({
    fileName: summary.fileName,
    fileSize: Number(file?.size ?? 0),
    importResult,
    projection,
    validation,
    summary
  });
};

export const getHWPXImportPreviewStatus = (summary = {}) => {
  if (!summary.canApply) {
    return Object.freeze({
      tone: "error",
      title: uiText("이 파일은 아직 불러올 수 없습니다"),
      description:
        uiText("문서 구조를 Dockit 편집기 구조로 안전하게 바꾸지 못했습니다. 현재 문서는 변경되지 않습니다.")
    });
  }

  const warningTotal =
    Number(summary.importWarningCount ?? 0) +
    Number(summary.lossCount ?? 0) +
    Number(summary.projectionWarningCount ?? 0) +
    Number(summary.validationWarningCount ?? 0);

  if (warningTotal > 0) {
    return Object.freeze({
      tone: "warning",
      title: uiText("불러올 수 있습니다"),
      description: uiText("일부 서식이 단순화될 수 있습니다. 적용 전 내용을 확인해 주세요.")
    });
  }

  return Object.freeze({
    tone: "success",
    title: uiText("불러올 수 있습니다"),
    description: uiText("현재 문서에 적용하기 전까지는 편집기 내용이 바뀌지 않습니다.")
  });
};

const collectPreviewIssues = (preview = {}) => [
  ...asArray(preview.validation?.errors),
  ...asArray(preview.importResult?.warnings),
  ...asArray(preview.importResult?.lossReport?.entries),
  ...asArray(preview.projection?.warnings),
  ...asArray(preview.validation?.warnings)
];

export const classifyHWPXImportPreviewDisposition = (preview = {}) => {
  const summary = preview?.summary || {};
  const issues = collectPreviewIssues(preview);
  const codes = issues.map((issue) => `${issue?.code ?? ""}`);
  const hasBlockingIssue =
    summary.canApply !== true ||
    Number(summary.importErrorCount ?? 0) > 0 ||
    Number(summary.lossErrorCount ?? 0) > 0 ||
    Number(summary.validationErrorCount ?? 0) > 0;
  const hasParserBugSignal = codes.some((code) =>
    /parser-bug|internal|invariant/i.test(code)
  );
  const hasUnsupportedFeatureSignal = codes.some((code) =>
    /unsupported|xml-unknown|control-unsupported|structure/i.test(code)
  );
  const warningTotal =
    Number(summary.importWarningCount ?? 0) +
    Number(summary.lossCount ?? 0) +
    Number(summary.projectionWarningCount ?? 0) +
    Number(summary.validationWarningCount ?? 0);

  if (hasParserBugSignal) {
    return Object.freeze({
      status: "parser-bug",
      canApply: false,
      userLabel: uiText("파서 점검이 필요합니다"),
      reason: "parser-diagnostic"
    });
  }

  if (hasBlockingIssue) {
    return Object.freeze({
      status: "blocked",
      canApply: false,
      userLabel: uiText("아직 불러올 수 없습니다"),
      reason: "blocking-issue"
    });
  }

  if (hasUnsupportedFeatureSignal) {
    return Object.freeze({
      status: "unsupported-feature",
      canApply: true,
      userLabel: uiText("지원하지 않는 기능이 단순화됩니다"),
      reason: "unsupported-feature"
    });
  }

  if (warningTotal > 0) {
    return Object.freeze({
      status: "partial",
      canApply: true,
      userLabel: uiText("일부 서식이 단순화될 수 있습니다"),
      reason: "warning-or-loss"
    });
  }

  return Object.freeze({
    status: "safe",
    canApply: true,
    userLabel: uiText("불러올 수 있습니다"),
    reason: "no-issues"
  });
};

const createWarningGroup = (title, description, items) =>
  Object.freeze({
    title,
    description,
    items: Object.freeze(asArray(items))
  });

export const classifyHWPXImportIssue = (issue = {}, source = "unknown") => {
  const severity = issue?.severity === "error" ? "error" : "warning";
  const code = `${issue?.code ?? ""}`;
  const blocking =
    severity === "error" ||
    source === "validation-error" ||
    code === "pm-projection-schema-invalid" ||
    code === "pm-projection-editor-state-invalid";

  if (blocking) {
    return Object.freeze({
      category: "blocking-error",
      blocking: true,
      userVisible: true,
      developerDiagnostic: true,
      userMessage: uiText("이 항목 때문에 현재 파일은 아직 안전하게 적용할 수 없습니다.")
    });
  }

  if (source === "loss") {
    return Object.freeze({
      category: "semantic-loss",
      blocking: false,
      userVisible: true,
      developerDiagnostic: true,
      userMessage: uiText("원본 한글 문서의 일부 기능이 단순화될 수 있습니다.")
    });
  }

  if (source === "projection") {
    return Object.freeze({
      category: "projection-warning",
      blocking: false,
      userVisible: true,
      developerDiagnostic: true,
      userMessage: uiText("Dockit 편집기 구조로 바꾸는 과정에서 일부 항목이 단순화되었습니다.")
    });
  }

  if (source === "validation-warning") {
    return Object.freeze({
      category: "developer-diagnostic",
      blocking: false,
      userVisible: false,
      developerDiagnostic: true,
      userMessage: uiText("적용은 가능하지만 schema 비교용 진단 정보입니다.")
    });
  }

  return Object.freeze({
    category: "import-warning",
    blocking: false,
    userVisible: true,
    developerDiagnostic: true,
    userMessage: uiText("한글 문서 분석 과정에서 확인할 항목이 있습니다.")
  });
};

const withClassification = (items, source) =>
  asArray(items).map((item) =>
    Object.freeze({
      ...item,
      source,
      classification: classifyHWPXImportIssue(item, source)
    })
  );

export const createHWPXImportPreviewWarningGroups = (preview = {}) => {
  const validationErrors = asArray(preview.validation?.errors);
  const importWarnings = asArray(preview.importResult?.warnings);
  const lossEntries = asArray(preview.importResult?.lossReport?.entries);
  const projectionWarnings = asArray(preview.projection?.warnings);
  const validationWarnings = asArray(preview.validation?.warnings).filter(
    (warning) => warning?.severity !== "error"
  );

  return Object.freeze(
    [
      createWarningGroup(
        uiText("적용을 막는 오류"),
        uiText("이 항목이 있으면 현재 파일은 아직 안전하게 불러올 수 없습니다."),
        withClassification(validationErrors, "validation-error")
      ),
      createWarningGroup(
        uiText("한글 문서 분석 결과"),
        uiText("파일 구조를 읽는 과정에서 확인이 필요한 항목입니다."),
        withClassification(importWarnings, "import")
      ),
      createWarningGroup(
        uiText("지원하지 않는 한글 기능"),
        uiText("한글 문서의 일부 기능은 현재 Dockit에서 지원하지 않아 단순화될 수 있습니다."),
        withClassification(lossEntries, "loss")
      ),
      createWarningGroup(
        uiText("편집기 구조 변환 결과"),
        uiText("Dockit 편집기 구조로 바꾸는 과정에서 일부 항목이 단순화되었습니다."),
        withClassification(projectionWarnings, "projection")
      ),
      createWarningGroup(
        uiText("편집기 검증 참고 항목"),
        uiText("적용은 가능하지만 현재 편집기 schema와 비교해 확인할 항목입니다."),
        withClassification(validationWarnings, "validation-warning")
      )
    ].filter((group) => group.items.length > 0)
  );
};

export const runHWPXImportDryRun = async ({
  file,
  importHWPXToIR,
  irToProseMirror,
  validateProseMirrorProjection,
  inflateRaw = createHWPXBrowserInflateRaw(),
  extractedAt = new Date().toISOString()
} = {}) => {
  const fileValidation = validateHWPXImportFile(file);

  if (!fileValidation.valid) {
    return Object.freeze({
      ok: false,
      stage: "file-validation",
      reason: fileValidation.code,
      message: fileValidation.message,
      fileValidation
    });
  }

  if (
    typeof importHWPXToIR !== "function" ||
    typeof irToProseMirror !== "function" ||
    typeof validateProseMirrorProjection !== "function"
  ) {
    return Object.freeze({
      ok: false,
      stage: "dependency-validation",
      reason: "missing-dependency",
      message: "HWPX dry-run pipeline dependency is missing."
    });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const importResult = importHWPXToIR(bytes, {
      sourceName: file.name,
      inflateRaw,
      extractedAt
    });
    const projection = irToProseMirror(importResult.irDocument);
    const validation = validateProseMirrorProjection(projection.doc);
    const preview = createHWPXImportPreview({
      file,
      importResult,
      projection,
      validation
    });

    return Object.freeze({
      ok: true,
      stage: "preview",
      preview,
      importResult,
      projection,
      validation
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      stage: "dry-run",
      reason: "dry-run-error",
      message: HWPX_IMPORT_ERROR_MESSAGE,
      error
    });
  }
};

export const applyHWPXImportPreviewToEditor = (preview, editor) => {
  if (!preview?.summary?.canApply) {
    return {
      applied: false,
      reason: "not-applicable"
    };
  }

  if (!preview?.projection?.doc) {
    return {
      applied: false,
      reason: "missing-projection"
    };
  }

  if (!editor || editor.isDestroyed || !editor.commands?.setContent) {
    return {
      applied: false,
      reason: "editor-unavailable"
    };
  }

  try {
    const applied = editor.commands.setContent(preview.projection.doc);

    return {
      applied: applied !== false,
      reason: applied === false ? "set-content-failed" : "applied"
    };
  } catch (error) {
    return {
      applied: false,
      reason: "set-content-threw",
      error
    };
  }
};
