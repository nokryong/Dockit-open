"use client";

import { Typography } from "sud-ui";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import {
  ModalActionButton,
  ModalFrame
} from "@/app/LIB/components/common/modal/ModalPrimitives";

const surfaceColor = (isDarkMode) => (isDarkMode ? "#111827" : "#ffffff");
const textColor = (isDarkMode) => (isDarkMode ? "#f9fafb" : "#111827");
const mutedTextColor = (isDarkMode) => (isDarkMode ? "#9ca3af" : "#6b7280");
const borderColor = (isDarkMode) => (isDarkMode ? "#374151" : "#e5e7eb");

const severityTone = (severity, isDarkMode) => severity === "blocked"
  ? {
      background: isDarkMode ? "#4c1d25" : "#fff1f2",
      border: isDarkMode ? "#881337" : "#fecdd3",
      color: isDarkMode ? "#fecdd3" : "#be123c",
      label: "출력 차단"
    }
  : {
      background: isDarkMode ? "#422006" : "#fffbeb",
      border: isDarkMode ? "#92400e" : "#fde68a",
      color: isDarkMode ? "#fde68a" : "#92400e",
      label: "확인 필요"
    };

function IssueRow({ issue, isDarkMode }) {
  const tone = severityTone(issue.severity, isDarkMode);

  return (
    <li
      data-testid={`pdf-output-preflight-issue-${issue.code}`}
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        padding: 12,
        background: tone.background,
        listStyle: "none"
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography pretendard="B" style={{ color: textColor(isDarkMode) }}>
          {issue.title}
        </Typography>
        <span
          style={{
            border: `1px solid ${tone.border}`,
            borderRadius: 999,
            padding: "2px 8px",
            color: tone.color,
            background: surfaceColor(isDarkMode),
            fontSize: 12,
            fontWeight: 700
          }}
        >
          {tone.label}{issue.count > 1 ? ` ${issue.count}개` : ""}
        </span>
      </div>
      <Typography
        as="p"
        size="sm"
        style={{ marginTop: 6, color: mutedTextColor(isDarkMode) }}
      >
        {issue.message}
      </Typography>
    </li>
  );
}

export default function PdfOutputPreflightModal({
  open,
  report,
  onClose,
  onRecheck,
  onConfirm
}) {
  const { isDarkMode } = useDarkMode();
  const blocked = report?.status === "blocked";
  const warning = report?.status === "warning";

  if (!report || (!blocked && !warning)) return null;

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      isDarkMode={isDarkMode}
      maxWidth="680px"
      ariaLabel={blocked
        ? "PDF 출력 전에 해결해 주세요"
        : "PDF 출력 전에 확인해 주세요"}
      style={{
        width: "min(680px, 92vw)",
        maxHeight: "84vh",
        overflow: "hidden",
        background: surfaceColor(isDarkMode)
      }}
    >
      <section
        data-testid="pdf-output-preflight-modal"
        className="flex flex-col"
        style={{ maxHeight: "78vh", color: textColor(isDarkMode) }}
      >
        <div style={{ borderBottom: `1px solid ${borderColor(isDarkMode)}`, paddingBottom: 14 }}>
          <Typography as="h2" id="pdf-output-preflight-title" pretendard="B" size="lg">
            {blocked ? "PDF 출력 전에 해결해 주세요" : "PDF 출력 전에 확인해 주세요"}
          </Typography>
          <Typography
            as="p"
            role={blocked ? "alert" : "status"}
            size="sm"
            style={{ marginTop: 6, color: mutedTextColor(isDarkMode) }}
          >
            {blocked
              ? `출력을 막는 항목이 ${report.blockers.length}종류 있습니다. 해결 전에는 인쇄 미리 보기를 열지 않습니다.`
              : `결과가 달라질 수 있는 항목이 ${report.warnings.length}종류 있습니다. 내용을 확인한 경우에만 계속해 주세요.`}
          </Typography>
        </div>

        <ul
          className="flex flex-col gap-2"
          style={{ margin: 0, padding: "14px 2px", overflowY: "auto" }}
        >
          {report.issues.map((issue) => (
            <IssueRow key={issue.code} issue={issue} isDarkMode={isDarkMode} />
          ))}
        </ul>

        <div
          className="flex flex-wrap justify-end gap-2"
          style={{ borderTop: `1px solid ${borderColor(isDarkMode)}`, paddingTop: 14 }}
        >
          <ModalActionButton isDarkMode={isDarkMode} onClick={onClose}>
            {blocked ? "닫기" : "취소"}
          </ModalActionButton>
          {blocked ? (
            <ModalActionButton
              isDarkMode={isDarkMode}
              onClick={onRecheck}
              data-testid="pdf-output-preflight-recheck"
            >
              다시 확인
            </ModalActionButton>
          ) : (
            <ModalActionButton
              isDarkMode={isDarkMode}
              onClick={onConfirm}
              data-testid="pdf-output-preflight-confirm"
            >
              경고 확인 후 인쇄
            </ModalActionButton>
          )}
        </div>
      </section>
    </ModalFrame>
  );
}
