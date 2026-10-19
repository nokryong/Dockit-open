import { t as uiText } from "../i18n";
export const DOCX_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

export const DOCX_IMPORT_ERROR_MESSAGE =
  "DOCX 불러오기에 실패했습니다. 파일을 확인한 뒤 다시 시도해 주세요.";

const asArray = (value) => (Array.isArray(value) ? value : []);

export const isDOCXImportFileName = (fileName) =>
  typeof fileName === "string" && /\.docx$/i.test(fileName.trim());

export const validateDOCXImportFile = (
  file,
  { maxBytes = DOCX_IMPORT_MAX_BYTES } = {}
) => {
  const fileName = `${file?.name ?? ""}`.trim();
  const size = Number(file?.size ?? 0);

  if (!fileName) {
    return {
      valid: false,
      code: "docx-import-file-missing",
      message: uiText("불러올 DOCX 파일을 선택해 주세요.")
    };
  }

  if (!isDOCXImportFileName(fileName)) {
    return {
      valid: false,
      code: "docx-import-file-extension",
      message: uiText("DOCX 파일(.docx)만 불러올 수 있습니다.")
    };
  }

  if (!Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      code: "docx-import-file-empty",
      message: uiText("빈 DOCX 파일은 불러올 수 없습니다.")
    };
  }

  if (size > maxBytes) {
    return {
      valid: false,
      code: "docx-import-file-too-large",
      message: uiText("DOCX 파일은 최대 {0}MB까지 불러올 수 있습니다.", Math.floor(maxBytes / 1024 / 1024))
    };
  }

  return {
    valid: true,
    code: "docx-import-file-ok",
    message: uiText("DOCX 파일을 dry-run할 수 있습니다.")
  };
};

export const startDOCXImportDryRun = (inFlightRef) => {
  if (!inFlightRef || typeof inFlightRef !== "object") {
    return false;
  }

  if (inFlightRef.current) {
    return false;
  }

  inFlightRef.current = true;
  return true;
};

export const finishDOCXImportDryRun = (inFlightRef) => {
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

  ["sections", "blocks", "items", "rows", "cells", "runs"].forEach((key) => {
    if (Array.isArray(value[key])) {
      value[key].forEach((child) => collectIRFeatureFlags(child, flags));
    }
  });

  return flags;
};

const toFeatureLabels = (flags = {}) =>
  [
    flags.hasTable ? uiText("표") : null,
    flags.hasImage ? uiText("이미지") : null,
    flags.hasLink ? uiText("링크") : null,
    flags.hasList ? uiText("목록") : null
  ].filter(Boolean);

export const createDOCXImportDryRunSummary = ({
  fileName,
  importResult,
  projection,
  validation
} = {}) => {
  const importWarnings = asArray(importResult?.warnings);
  const projectionWarnings = asArray(projection?.warnings);
  const validationWarnings = asArray(validation?.warnings);
  const validationErrors = asArray(validation?.errors);
  const importErrorCount = importWarnings.filter(
    (warning) => warning?.severity === "error"
  ).length;
  const text = collectIRText(importResult?.irDocument).replace(/\s+/g, " ").trim();
  const featureFlags = collectIRFeatureFlags(importResult?.irDocument);
  const validationValid = validation?.valid === true;

  return Object.freeze({
    fileName: `${fileName ?? ""}`.trim() || "선택한 DOCX",
    canApply: validationValid && importErrorCount === 0,
    validationValid,
    blockCount: countIRBlocks(importResult?.irDocument),
    textPreview: text.slice(0, 160),
    textLength: text.length,
    importWarningCount: importWarnings.length,
    importErrorCount,
    lossCount: 0,
    lossErrorCount: 0,
    projectionWarningCount: projectionWarnings.length,
    validationWarningCount: validationWarnings.length,
    validationErrorCount: validationErrors.length,
    packageEntryCount: Number(importResult?.packageSummary?.entryCount ?? 0),
    sectionCount: Number(asArray(importResult?.irDocument?.sections).length ?? 0),
    hasTable: Boolean(featureFlags.hasTable),
    hasImage: Boolean(featureFlags.hasImage),
    hasLink: Boolean(featureFlags.hasLink),
    hasList: Boolean(featureFlags.hasList),
    featureLabels: Object.freeze(toFeatureLabels(featureFlags))
  });
};

export const createDOCXImportPreview = ({
  file,
  importResult,
  projection,
  validation
} = {}) => {
  const summary = createDOCXImportDryRunSummary({
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

export const runDOCXImportDryRun = async ({
  file,
  importDOCXToIR,
  irToProseMirror,
  validateProseMirrorProjection,
  extractedAt = new Date().toISOString()
} = {}) => {
  const fileValidation = validateDOCXImportFile(file);

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
    typeof importDOCXToIR !== "function" ||
    typeof irToProseMirror !== "function" ||
    typeof validateProseMirrorProjection !== "function"
  ) {
    return Object.freeze({
      ok: false,
      stage: "dependency-validation",
      reason: "missing-dependency",
      message: "DOCX dry-run pipeline dependency is missing."
    });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const importResult = importDOCXToIR(bytes, {
      sourceName: file.name,
      extractedAt
    });
    const projection = irToProseMirror(importResult.irDocument);
    const validation = validateProseMirrorProjection(projection.doc);
    const preview = createDOCXImportPreview({
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
      message: DOCX_IMPORT_ERROR_MESSAGE,
      error
    });
  }
};

export const applyDOCXImportPreviewToEditor = (preview, editor) => {
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
