"use client";

import { Close, ErrorTriangleOutline, EyeOutline } from "sud-icons";
import { Typography } from "sud-ui";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import {
  ModalActionButton,
  ModalFrame
} from "@/app/LIB/components/common/modal/ModalPrimitives";

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

const surfaceColor = (isDarkMode) => (isDarkMode ? "#111827" : "#ffffff");
const textColor = (isDarkMode) => (isDarkMode ? "#f9fafb" : "#111827");
const mutedTextColor = (isDarkMode) => (isDarkMode ? "#9ca3af" : "#6b7280");
const borderColor = (isDarkMode) => (isDarkMode ? "#374151" : "#e5e7eb");
const softBackground = (isDarkMode) => (isDarkMode ? "#1f2937" : "#f9fafb");

function WarningGroup({ group, isDarkMode }) {
  const tone = severityTone(group.severity, isDarkMode);
  const visibleBlocks = group.affectedBlocks.slice(0, 5);
  const hiddenCount = Math.max(0, group.affectedBlocks.length - visibleBlocks.length);

  return (
    <section
      style={{
        border: `1px solid ${borderColor(isDarkMode)}`,
        borderRadius: 8,
        padding: 14,
        background: surfaceColor(isDarkMode)
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Typography pretendard="B" style={{ color: textColor(isDarkMode) }}>
              {group.title}
            </Typography>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                border: `1px solid ${tone.border}`,
                borderRadius: 999,
                padding: "2px 8px",
                color: tone.color,
                background: tone.background,
                fontSize: 12,
                fontWeight: 700
              }}
            >
              {group.severityLabel}
            </span>
            <code
              style={{
                border: `1px solid ${borderColor(isDarkMode)}`,
                borderRadius: 6,
                padding: "2px 6px",
                color: mutedTextColor(isDarkMode),
                background: softBackground(isDarkMode),
                fontSize: 12
              }}
            >
              {group.code}
            </code>
          </div>
          <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
            {group.description}
          </Typography>
        </div>
        <span
          style={{
            whiteSpace: "nowrap",
            color: mutedTextColor(isDarkMode),
            fontSize: 13
          }}
        >
          {group.count}개
        </span>
      </div>

      <div
        style={{
          marginTop: 12,
          borderRadius: 8,
          background: softBackground(isDarkMode),
          padding: "10px 12px",
          color: textColor(isDarkMode),
          fontSize: 13
        }}
      >
        <strong>내보낸 방식</strong>
        <div style={{ marginTop: 4, color: mutedTextColor(isDarkMode) }}>
          {group.fallback}
        </div>
      </div>

      {visibleBlocks.length > 0 && (
        <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
          <Typography size="sm" pretendard="B" style={{ color: textColor(isDarkMode) }}>
            영향 위치
          </Typography>
          {visibleBlocks.map((block, index) => (
            <div
              key={`${group.code}-${block.label}-${index}`}
              style={{
                borderLeft: `3px solid ${tone.border}`,
                paddingLeft: 10,
                color: mutedTextColor(isDarkMode),
                fontSize: 13
              }}
            >
              <div style={{ color: textColor(isDarkMode) }}>
                {block.label} · {block.blockTypeLabel}
              </div>
              {block.message && (
                <div style={{ marginTop: 2 }}>{block.message}</div>
              )}
              {block.path && (
                <code
                  style={{
                    display: "inline-block",
                    marginTop: 4,
                    fontSize: 12,
                    color: mutedTextColor(isDarkMode)
                  }}
                >
                  {block.path}
                </code>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
              외 {hiddenCount}개 위치가 더 있습니다.
            </Typography>
          )}
        </div>
      )}
    </section>
  );
}

export function HwpxWarningDetailTrigger({ details, onOpen }) {
  const { isDarkMode } = useDarkMode();

  if (!details?.hasWarnings) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="HWPX 내보내기 상세 보기"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 50,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: `1px solid ${borderColor(isDarkMode)}`,
        borderRadius: 8,
        padding: "10px 12px",
        color: textColor(isDarkMode),
        background: surfaceColor(isDarkMode),
        boxShadow: isDarkMode
          ? "0 10px 30px rgba(0, 0, 0, 0.35)"
          : "0 10px 30px rgba(15, 23, 42, 0.16)",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 700
      }}
    >
      <EyeOutline size={17} />
      HWPX 상세 보기
      <span
        style={{
          borderRadius: 999,
          padding: "1px 7px",
          color: severityTone("warning", isDarkMode).color,
          background: severityTone("warning", isDarkMode).background,
          fontSize: 12
        }}
      >
        {details.total}
      </span>
    </button>
  );
}

export default function HwpxWarningDetailModal({ open, details, onClose }) {
  const { isDarkMode } = useDarkMode();

  if (!details?.hasWarnings) {
    return null;
  }

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      isDarkMode={isDarkMode}
      maxWidth="760px"
      style={{
        width: "min(760px, 92vw)",
        maxHeight: "84vh",
        overflow: "hidden",
        background: surfaceColor(isDarkMode)
      }}
    >
      <div
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
          <div className="flex items-start gap-2">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 8,
                color: severityTone("warning", isDarkMode).color,
                background: severityTone("warning", isDarkMode).background
              }}
            >
              <ErrorTriangleOutline size={21} />
            </span>
            <div>
              <Typography as="h2" pretendard="B" size="lg">
                HWPX 내보내기 상세
              </Typography>
              <Typography size="sm" style={{ color: mutedTextColor(isDarkMode) }}>
                파일은 다운로드되었고, 아래 {details.total}개 항목은 대체 방식으로
                처리되었습니다.
              </Typography>
            </div>
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
          className="flex flex-col gap-2"
          style={{
            overflowY: "auto",
            paddingTop: 14,
            paddingRight: 2
          }}
        >
          {details.groups.map((group) => (
            <WarningGroup
              key={`${group.code}-${group.severity}`}
              group={group}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      </div>
    </ModalFrame>
  );
}
