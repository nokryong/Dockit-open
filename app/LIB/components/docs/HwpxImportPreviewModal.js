import { Close, ErrorTriangleOutline } from "sud-icons";
import { Typography } from "sud-ui";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import {
  ModalActionButton,
  ModalFrame
} from "@/app/LIB/components/common/modal/ModalPrimitives";
import {
  createHWPXImportPreviewWarningGroups,
  getHWPXImportPreviewStatus
} from "@/app/LIB/utils/hwpxImportButtonUtils";

const surfaceColor = (isDarkMode) => (isDarkMode ? "#111827" : "#ffffff");
const textColor = (isDarkMode) => (isDarkMode ? "#f9fafb" : "#111827");
const mutedTextColor = (isDarkMode) => (isDarkMode ? "#9ca3af" : "#6b7280");
const borderColor = (isDarkMode) => (isDarkMode ? "#374151" : "#e5e7eb");
const softBackground = (isDarkMode) => (isDarkMode ? "#1f2937" : "#f9fafb");

const statusToneColor = (tone, isDarkMode) => {
  if (tone === "error") {
    return isDarkMode ? "#fecdd3" : "#be123c";
  }

  if (tone === "warning") {
    return isDarkMode ? "#fde68a" : "#92400e";
  }

  return isDarkMode ? "#bbf7d0" : "#166534";
};

const statusToneBackground = (tone, isDarkMode) => {
  if (tone === "error") {
    return isDarkMode ? "#4c1d25" : "#fff1f2";
  }

  if (tone === "warning") {
    return isDarkMode ? "#3f2f12" : "#fffbeb";
  }

  return isDarkMode ? "#14351f" : "#f0fdf4";
};

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);

  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

function SummaryItem({ label, value, isDarkMode, tone = "default" }) {
  const color =
    tone === "error"
      ? isDarkMode
        ? "#fecdd3"
        : "#be123c"
      : tone === "warning"
        ? isDarkMode
          ? "#fde68a"
          : "#92400e"
        : textColor(isDarkMode);

  return (
    <div
      style={{
        border: `1px solid ${borderColor(isDarkMode)}`,
        borderRadius: 8,
        padding: "10px 12px",
        background: softBackground(isDarkMode)
      }}
    >
      <Typography size="xs" style={{ color: mutedTextColor(isDarkMode) }}>
        {label}
      </Typography>
      <div style={{ marginTop: 4, color, fontSize: 18, fontWeight: 800 }}>
        {value}
      </div>
    </div>
  );
}

function WarningList({ title, description, items, isDarkMode }) {
  const visibleItems = asArray(items).slice(0, 5);
  const hiddenCount = Math.max(0, asArray(items).length - visibleItems.length);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <section
      style={{
        border: `1px solid ${borderColor(isDarkMode)}`,
        borderRadius: 8,
        padding: 12,
        background: surfaceColor(isDarkMode)
      }}
    >
      <Typography pretendard="B" style={{ color: textColor(isDarkMode) }}>
        {title}
      </Typography>
      {description && (
        <Typography
          size="sm"
          style={{ marginTop: 4, color: mutedTextColor(isDarkMode) }}
        >
          {description}
        </Typography>
      )}
      <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
        {visibleItems.map((item, index) => (
          <div
            key={`${title}-${item.code || item.path || index}`}
            style={{
              borderLeft: `3px solid ${borderColor(isDarkMode)}`,
              paddingLeft: 10,
              color: mutedTextColor(isDarkMode),
              fontSize: 13
            }}
          >
            <div style={{ color: textColor(isDarkMode), fontWeight: 700 }}>
              {item.code || "warning"}
              {item.severity ? ` · ${item.severity}` : ""}
            </div>
            {item.message && <div style={{ marginTop: 2 }}>{item.message}</div>}
            {item.path && (
              <code
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: 12,
                  color: mutedTextColor(isDarkMode)
                }}
              >
                {item.path}
              </code>
            )}
          </div>
        ))}
        {hiddenCount > 0 && (
          <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
            외 {hiddenCount}개 항목이 더 있습니다.
          </Typography>
        )}
      </div>
    </section>
  );
}

export default function HwpxImportPreviewModal({
  open,
  preview,
  applying,
  onApply,
  onClose
}) {
  const { isDarkMode } = useDarkMode();

  if (!preview) {
    return null;
  }

  const { summary } = preview;
  const status = getHWPXImportPreviewStatus(summary);
  const warningGroups = createHWPXImportPreviewWarningGroups(preview);

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      isDarkMode={isDarkMode}
      maxWidth="780px"
      style={{
        width: "min(780px, 92vw)",
        maxHeight: "84vh",
        overflow: "hidden",
        background: surfaceColor(isDarkMode)
      }}
    >
      <div
        data-testid="hwpx-import-preview-modal"
        className="flex flex-col"
        style={{
          maxHeight: "78vh",
          color: textColor(isDarkMode)
        }}
      >
        <div
          className="flex items-start justify-between gap-4"
          style={{
            borderBottom: `1px solid ${borderColor(isDarkMode)}`,
            paddingBottom: 14
          }}
        >
          <div>
            <Typography as="h2" pretendard="B" size="lg">
              HWPX 불러오기 확인
            </Typography>
            <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
              적용하기 전 dry-run 결과입니다. 승인하기 전에는 현재 문서를 변경하지 않습니다.
            </Typography>
          </div>
          <ModalActionButton
            isDarkMode={isDarkMode}
            size="sm"
            border
            onClick={onClose}
            style={{ whiteSpace: "nowrap" }}
          >
            <span className="flex items-center gap-2">
              <Close size={14} />
              닫기
            </span>
          </ModalActionButton>
        </div>

        <div
          className="flex flex-col gap-3"
          style={{
            overflowY: "auto",
            paddingTop: 14,
            paddingRight: 2
          }}
        >
          <section
            style={{
              border: `1px solid ${borderColor(isDarkMode)}`,
              borderRadius: 8,
              padding: 14,
              background: statusToneBackground(status.tone, isDarkMode)
            }}
          >
            <div className="flex items-start gap-2">
              {status.tone === "error" && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    color: isDarkMode ? "#fecdd3" : "#be123c",
                    background: isDarkMode ? "#4c1d25" : "#fff1f2"
                  }}
                >
                  <ErrorTriangleOutline size={20} />
                </span>
              )}
              <div>
                <Typography
                  pretendard="B"
                  style={{ color: statusToneColor(status.tone, isDarkMode) }}
                >
                  {status.title}
                </Typography>
                <Typography
                  size="sm"
                  style={{ marginTop: 2, color: mutedTextColor(isDarkMode) }}
                >
                  {status.description}
                </Typography>
                <Typography pretendard="B" style={{ color: textColor(isDarkMode) }}>
                  {summary.fileName}
                </Typography>
                <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
                  {formatBytes(preview.fileSize)} · {summary.packageEntryCount}개 package entry ·{" "}
                  {summary.sectionCount}개 section
                </Typography>
                <Typography
                  size="sm"
                  style={{ marginTop: 6, color: mutedTextColor(isDarkMode) }}
                >
                  원본 한글 문서와 화면이 완전히 동일하게 보장되지는 않습니다.
                </Typography>
              </div>
            </div>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8
            }}
          >
            <SummaryItem
              label="블록"
              value={summary.blockCount}
              isDarkMode={isDarkMode}
            />
            <SummaryItem
              label="분석 경고"
              value={summary.importWarningCount}
              tone={summary.importErrorCount > 0 ? "error" : summary.importWarningCount > 0 ? "warning" : "default"}
              isDarkMode={isDarkMode}
            />
            <SummaryItem
              label="지원 제한"
              value={summary.lossCount}
              tone={summary.lossErrorCount > 0 ? "error" : summary.lossCount > 0 ? "warning" : "default"}
              isDarkMode={isDarkMode}
            />
            <SummaryItem
              label="변환 경고"
              value={summary.projectionWarningCount}
              tone={summary.projectionWarningCount > 0 ? "warning" : "default"}
              isDarkMode={isDarkMode}
            />
            <SummaryItem
              label="적용 오류"
              value={summary.validationErrorCount}
              tone={summary.validationErrorCount > 0 ? "error" : "default"}
              isDarkMode={isDarkMode}
            />
          </div>

          <section
            style={{
              border: `1px solid ${borderColor(isDarkMode)}`,
              borderRadius: 8,
              padding: 12,
              background: surfaceColor(isDarkMode)
            }}
          >
            <Typography pretendard="B" style={{ color: textColor(isDarkMode) }}>
              포함된 주요 항목
            </Typography>
            <Typography
              size="sm"
              style={{ marginTop: 6, color: mutedTextColor(isDarkMode) }}
            >
              {summary.featureLabels?.length
                ? summary.featureLabels.join(", ")
                : "텍스트 중심 문서"}
            </Typography>
          </section>

          {summary.textPreview && (
            <section
              style={{
                border: `1px solid ${borderColor(isDarkMode)}`,
                borderRadius: 8,
                padding: 12,
                background: surfaceColor(isDarkMode)
              }}
            >
              <Typography pretendard="B" style={{ color: textColor(isDarkMode) }}>
                텍스트 미리보기
              </Typography>
              <Typography
                size="sm"
                style={{ marginTop: 6, color: mutedTextColor(isDarkMode) }}
              >
                {summary.textPreview}
                {summary.textLength > summary.textPreview.length ? "..." : ""}
              </Typography>
            </section>
          )}

          {warningGroups.map((group) => (
            <WarningList
              key={group.title}
              title={group.title}
              description={group.description}
              items={group.items}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>

        <div
          className="flex justify-end gap-2"
          style={{
            borderTop: `1px solid ${borderColor(isDarkMode)}`,
            paddingTop: 14,
            marginTop: 14
          }}
        >
          <ModalActionButton
            data-testid="hwpx-import-cancel-button"
            isDarkMode={isDarkMode}
            border
            onClick={onClose}
          >
            취소
          </ModalActionButton>
          <ModalActionButton
            data-testid="hwpx-import-apply-button"
            isDarkMode={isDarkMode}
            onClick={onApply}
            disabled={!summary.canApply || applying}
          >
            {applying ? "적용 중..." : "불러오기 적용"}
          </ModalActionButton>
        </div>
      </div>
    </ModalFrame>
  );
}
