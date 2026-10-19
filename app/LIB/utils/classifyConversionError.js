import { t as uiText } from "../i18n";
const UNSUPPORTED_FORMAT_REASONS = new Set([
  "docx-import-file-extension",
  "hwpx-import-file-extension"
]);

const SIZE_EXCEEDED_REASONS = new Set([
  "docx-import-file-too-large",
  "hwpx-import-file-too-large"
]);

const INVALID_PACKAGE_REASONS = new Set([
  "docx-import-file-missing",
  "docx-import-file-empty",
  "hwpx-import-file-missing",
  "hwpx-import-file-empty"
]);

export const IMPORT_READINESS_BLOCKED_CODE = "import-readiness-blocked";

const BLOCKED_WARNING_ENTRY = Object.freeze({
  code: IMPORT_READINESS_BLOCKED_CODE,
  severity: "blocked"
});

const LEGACY_HWP_PATTERN = /\.hwp$/i;
const PACKAGE_ERROR_PATTERN =
  /zip|package|archive|central directory|end of central directory|eocd|inflate|deflate|compression|압축|패키지|손상/i;
const PARSE_ERROR_PATTERN =
  /xml|parse|parser|tag|element|attribute|well-formed|malformed|unexpected token|unexpected close|namespace|구문|해석/i;

const createClassification = ({
  category,
  title,
  message,
  action,
  blocked = false,
  correlationId
}) =>
  Object.freeze({
    category,
    title,
    message,
    action,
    blocked,
    ...(correlationId ? { correlationId } : {})
  });

const toFileName = (fileName) => `${fileName ?? ""}`.trim();

const toErrorMessage = (error) => {
  if (typeof error?.message === "string") {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
};

const formatLimitLabel = (maxBytes) => {
  const megaBytes = Number.isFinite(maxBytes)
    ? Math.floor(Number(maxBytes) / 1024 / 1024)
    : 0;

  return megaBytes > 0 ? `${megaBytes}MB` : "제한 용량";
};

const createCorrelationId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const createInvalidPackageClassification = () =>
  createClassification({
    category: "invalid-package",
    title: uiText("올바른 HWPX/DOCX 파일이 아닙니다"),
    message:
      uiText("압축 패키지를 열지 못했거나 필수 문서 항목이 없어 현재 문서는 변경하지 않았습니다."),
    action: "reselect-package"
  });

const createUnsupportedFormatClassification = (fileName) => {
  if (LEGACY_HWP_PATTERN.test(toFileName(fileName))) {
    return createClassification({
      category: "unsupported-format",
      title: uiText("지원하지 않는 파일 형식입니다"),
      message: uiText("HWP(구형)는 지원하지 않습니다. HWPX로 저장 후 시도해 주세요."),
      action: "convert-hwp-to-hwpx"
    });
  }

  return createClassification({
    category: "unsupported-format",
    title: uiText("지원하지 않는 파일 형식입니다"),
    message: uiText("DOCX 또는 HWPX 파일만 가져올 수 있습니다."),
    action: "choose-supported-file"
  });
};

const createSizeExceededClassification = (maxBytes) => {
  const limitLabel = formatLimitLabel(maxBytes);

  return createClassification({
    category: "size-exceeded",
    title: uiText("파일 크기 제한을 초과했습니다"),
    message: uiText("{0} 이하 파일만 가져올 수 있습니다.", limitLabel),
    action: "choose-smaller-file"
  });
};

const createParseFailureClassification = () => {
  const correlationId = createCorrelationId();

  return createClassification({
    category: "parse-failure",
    title: uiText("문서를 해석하지 못했습니다"),
    message: uiText("문서를 해석하지 못했습니다. (오류 코드: {0})", correlationId),
    action: "check-parse-error",
    correlationId
  });
};

export const classifyImportDryRunFailure = ({
  dryRunResult,
  fileName,
  maxBytes
} = {}) => {
  const reason = `${dryRunResult?.reason ?? ""}`;
  const stage = `${dryRunResult?.stage ?? ""}`;
  const errorMessage = toErrorMessage(dryRunResult?.error);

  if (UNSUPPORTED_FORMAT_REASONS.has(reason)) {
    return createUnsupportedFormatClassification(fileName);
  }

  if (SIZE_EXCEEDED_REASONS.has(reason)) {
    return createSizeExceededClassification(maxBytes);
  }

  if (INVALID_PACKAGE_REASONS.has(reason)) {
    return createInvalidPackageClassification();
  }

  if (stage === "dry-run") {
    if (PACKAGE_ERROR_PATTERN.test(errorMessage)) {
      return createInvalidPackageClassification();
    }

    if (reason === "dry-run-error" && (PARSE_ERROR_PATTERN.test(errorMessage) || !errorMessage)) {
      return createParseFailureClassification();
    }

    return createInvalidPackageClassification();
  }

  return createInvalidPackageClassification();
};

export const classifyImportPreviewDisposition = ({ preview } = {}) => {
  if (preview?.summary?.canApply !== false) {
    return null;
  }

  return createClassification({
    category: "blocked",
    title: uiText("적용 전 확인 필요"),
    message: uiText("적용 전 해결이 필요한 항목이 있습니다. 자세히 보기에서 차단 사유를 확인해 주세요."),
    action: "review-blocking-items",
    blocked: true
  });
};

export const getBlockedWarningEntry = () => BLOCKED_WARNING_ENTRY;
