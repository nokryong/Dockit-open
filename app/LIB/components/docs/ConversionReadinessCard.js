"use client";

import { Typography } from "sud-ui";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import { getWarningCatalogEntry } from "@/app/LIB/ir/warningCatalog.js";
import { PRODUCT_HELP_COPY } from "@/app/LIB/constant/productHelpCopy";

const FUNCTIONAL_AREA_ORDER = Object.freeze([
  "텍스트·스타일",
  "표",
  "목록",
  "이미지·미디어",
  "링크",
  "페이지 설정",
  "기타 개체"
]);

const STATUS_PRIORITY = Object.freeze({
  "유지": 0,
  "부분 유지": 1,
  "생략·대체": 2
});

const STATUS_LABELS = Object.freeze({
  "유지": "그대로 유지",
  "부분 유지": "부분 유지",
  "생략·대체": "자리만 표시"
});

const VARIANT_LABELS = Object.freeze({
  import: "가져오기",
  export: "내보내기"
});

const surfaceColor = (isDarkMode) => (isDarkMode ? "#111827" : "#ffffff");
const textColor = (isDarkMode) => (isDarkMode ? "#f9fafb" : "#111827");
const mutedTextColor = (isDarkMode) => (isDarkMode ? "#9ca3af" : "#6b7280");
const borderColor = (isDarkMode) => (isDarkMode ? "#374151" : "#e5e7eb");
const softBackground = (isDarkMode) => (isDarkMode ? "#1f2937" : "#f9fafb");

const severityTone = (severity, isDarkMode) => {
  if (severity === "blocked") {
    return {
      background: isDarkMode ? "#4c1d25" : "#fff1f2",
      border: isDarkMode ? "#881337" : "#fecdd3",
      color: isDarkMode ? "#fecdd3" : "#be123c"
    };
  }

  return {
    background: isDarkMode ? "#422006" : "#fffbeb",
    border: isDarkMode ? "#92400e" : "#fde68a",
    color: isDarkMode ? "#fde68a" : "#92400e"
  };
};

const normalizeVariant = (variant) =>
  variant === "export" ? "export" : "import";

const normalizeWarnings = (warnings) =>
  Array.isArray(warnings) ? warnings.filter(Boolean) : [];

const getHeaderMessage = (totalWarnings, hasBlockedWarnings) => {
  if (totalWarnings <= 0) {
    return "바로 적용";
  }

  if (hasBlockedWarnings) {
    return `적용 전 해결 필요 ${totalWarnings}개 항목`;
  }

  return `⚠ ${totalWarnings}개 항목 주의`;
};

const summarizeWarningsByArea = (warnings) => {
  const grouped = new Map();
  const normalizedWarnings = normalizeWarnings(warnings);
  let hasBlockedWarnings = false;

  normalizedWarnings.forEach((warning) => {
    const severity = warning?.severity === "blocked" ? "blocked" : "warning";
    const catalogEntry = getWarningCatalogEntry(warning?.code);
    const area = catalogEntry.functionalArea;
    const existing = grouped.get(area);

    hasBlockedWarnings ||= severity === "blocked";

    if (existing) {
      existing.count += 1;
      existing.hasBlockedWarnings ||= severity === "blocked";

      if (
        (STATUS_PRIORITY[catalogEntry.status] ?? -1) >
        (STATUS_PRIORITY[existing.status] ?? -1)
      ) {
        existing.status = catalogEntry.status;
        existing.copy = catalogEntry.fallback;
      }

      return;
    }

    grouped.set(area, {
      area,
      count: 1,
      status: catalogEntry.status,
      copy: catalogEntry.fallback,
      hasBlockedWarnings: severity === "blocked"
    });
  });

  const warningAreas = FUNCTIONAL_AREA_ORDER.filter((area) => grouped.has(area)).map(
    (area) => Object.freeze(grouped.get(area))
  );
  const stableAreas = FUNCTIONAL_AREA_ORDER.filter((area) => !grouped.has(area));

  return Object.freeze({
    totalWarnings: normalizedWarnings.length,
    hasBlockedWarnings,
    warningAreas: Object.freeze(warningAreas),
    stableAreas: Object.freeze(stableAreas)
  });
};

function ActionButton({
  children,
  disabled = false,
  emphasis = "secondary",
  isDarkMode,
  ...rest
}) {
  const isPrimary = emphasis === "primary";

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        borderRadius: 8,
        border: `1px solid ${
          disabled
            ? isDarkMode
              ? "#374151"
              : "#d1d5db"
            : isPrimary
              ? isDarkMode
                ? "#60a5fa"
                : "#2563eb"
              : borderColor(isDarkMode)
        }`,
        background: disabled
          ? isDarkMode
            ? "#1f2937"
            : "#f3f4f6"
          : isPrimary
            ? isDarkMode
              ? "#1d4ed8"
              : "#2563eb"
            : surfaceColor(isDarkMode),
        color: disabled
          ? isDarkMode
            ? "#6b7280"
            : "#9ca3af"
          : isPrimary
            ? "#ffffff"
            : textColor(isDarkMode),
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.2,
        boxShadow: isDarkMode
          ? "0 1px 2px rgba(0, 0, 0, 0.35)"
          : "0 1px 2px rgba(15, 23, 42, 0.08)",
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap"
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function ReadinessRow({ label, count, status, copy, isDarkMode, blocked = false }) {
  const hasWarnings = count > 0;
  const tone = severityTone(blocked ? "blocked" : "warning", isDarkMode);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.3fr) auto",
        gap: 12,
        alignItems: "start",
        border: `1px solid ${borderColor(isDarkMode)}`,
        borderRadius: 10,
        padding: 12,
        background: surfaceColor(isDarkMode)
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Typography pretendard="B" style={{ color: textColor(isDarkMode) }}>
            {hasWarnings ? "⚠" : "✓"} {label}
            {hasWarnings ? ` (${count})` : ""}
          </Typography>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 999,
              padding: "2px 8px",
              fontSize: 12,
              fontWeight: 700,
              border: hasWarnings
                ? `1px solid ${tone.border}`
                : `1px solid ${borderColor(isDarkMode)}`,
              background: hasWarnings ? tone.background : softBackground(isDarkMode),
              color: hasWarnings ? tone.color : mutedTextColor(isDarkMode)
            }}
          >
            {STATUS_LABELS[status] || status}
          </span>
        </div>
        <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
          {copy}
        </Typography>
      </div>
    </div>
  );
}

export default function ConversionReadinessCard({
  variant = "import",
  warnings = [],
  onViewDetails,
  onCancel,
  onApply,
  onClose
}) {
  const { isDarkMode } = useDarkMode();
  const resolvedVariant = normalizeVariant(variant);
  const summary = summarizeWarningsByArea(warnings);
  const title = `${VARIANT_LABELS[resolvedVariant]} 준비 완료`;

  return (
    <section
      data-testid="conversion-readiness-card"
      style={{
        border: `1px solid ${borderColor(isDarkMode)}`,
        borderRadius: 14,
        background: surfaceColor(isDarkMode),
        color: textColor(isDarkMode),
        padding: 18,
        boxShadow: isDarkMode
          ? "0 12px 32px rgba(0, 0, 0, 0.28)"
          : "0 12px 28px rgba(15, 23, 42, 0.08)"
      }}
    >
      <div
        className="flex flex-col gap-2"
        style={{
          borderBottom: `1px solid ${borderColor(isDarkMode)}`,
          paddingBottom: 14
        }}
      >
        <Typography as="h2" pretendard="B" size="lg">
          {title}
        </Typography>
        <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
          {getHeaderMessage(summary.totalWarnings, summary.hasBlockedWarnings)}
        </Typography>
        <Typography
          data-testid="conversion-support-boundary"
          size="xs"
          style={{ color: mutedTextColor(isDarkMode) }}
        >
          {PRODUCT_HELP_COPY.conversion}
        </Typography>
      </div>

      <div className="flex flex-col gap-3" style={{ paddingTop: 14, paddingBottom: 16 }}>
        {summary.stableAreas.length > 0 ? (
          <div data-testid="conversion-readiness-stable-areas">
            <ReadinessRow
              label={summary.stableAreas.join("·")}
              status="유지"
              copy="문서 내용과 구조를 그대로 유지합니다."
              isDarkMode={isDarkMode}
            />
          </div>
        ) : null}

        {summary.warningAreas.map((area) => (
          <div
            key={area.area}
            data-testid={`conversion-readiness-area-${area.area}`}
          >
            <ReadinessRow
              label={area.area}
              count={area.count}
              status={area.status}
              copy={area.copy}
              isDarkMode={isDarkMode}
              blocked={area.hasBlockedWarnings}
            />
          </div>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3"
        style={{ borderTop: `1px solid ${borderColor(isDarkMode)}`, paddingTop: 14 }}
      >
        <ActionButton
          isDarkMode={isDarkMode}
          onClick={onViewDetails}
          data-testid="conversion-readiness-details"
        >
          자세히 보기
        </ActionButton>

        {resolvedVariant === "import" ? (
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              isDarkMode={isDarkMode}
              onClick={onCancel}
              data-testid="conversion-readiness-cancel"
            >
              취소
            </ActionButton>
            <ActionButton
              isDarkMode={isDarkMode}
              emphasis="primary"
              disabled={summary.hasBlockedWarnings}
              onClick={onApply}
              data-testid="conversion-readiness-apply"
            >
              적용
            </ActionButton>
          </div>
        ) : (
          <ActionButton
            isDarkMode={isDarkMode}
            onClick={onClose}
            data-testid="conversion-readiness-close"
          >
            닫기
          </ActionButton>
        )}
      </div>
    </section>
  );
}
