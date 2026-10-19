import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import PdfOutputPreflightModal from "../../../app/LIB/components/docs/PdfOutputPreflightModal";
import { DarkModeProvider } from "../../../app/LIB/context/DarkModeContext";
import { SettingProvider } from "../../../app/LIB/context/SettingContext";
import {
  auditPdfOutputPreflight,
  getPdfOutputPreflightIssueSignature
} from "../../../app/LIB/utils/pdfOutputPreflightAudit";

const editorRoot = document.querySelector("#editor-root");
const image = document.querySelector("#pending-image");
const tableRow = document.querySelector("#audited-table-row");
const status = document.querySelector("#fixture-status");
let imageState = "pending";
let printCount = 0;

Object.defineProperties(image, {
  complete: {
    configurable: true,
    get: () => imageState !== "pending"
  },
  naturalWidth: {
    configurable: true,
    get: () => imageState === "ready" ? 640 : 0
  }
});

const updateStatus = (message) => {
  status.textContent = `${message} · 인쇄 ${printCount}회`;
};

window.print = () => {
  printCount += 1;
  updateStatus("기본 인쇄 호출 완료");
};

function FixtureApp() {
  const [report, setReport] = useState(null);

  const inspect = useCallback(() => auditPdfOutputPreflight({
    rootElement: editorRoot,
    fontSet: []
  }), []);

  const openPrint = useCallback(() => {
    setReport(null);
    window.print();
    return true;
  }, []);

  const attemptPrint = useCallback(() => {
    const latestReport = inspect();

    if (!latestReport.canPrint || latestReport.requiresConfirmation) {
      setReport(latestReport);
      updateStatus(latestReport.status === "blocked" ? "출력 차단" : "경고 확인 대기");
      return false;
    }

    return openPrint();
  }, [inspect, openPrint]);

  const confirmPrint = useCallback(() => {
    if (!report?.requiresConfirmation) return false;

    const latestReport = inspect();
    const warningsChanged = latestReport.requiresConfirmation &&
      getPdfOutputPreflightIssueSignature(latestReport) !==
        getPdfOutputPreflightIssueSignature(report);

    if (!latestReport.canPrint || warningsChanged) {
      setReport(latestReport);
      updateStatus(latestReport.status === "blocked" ? "출력 차단" : "경고 변경됨");
      return false;
    }

    return openPrint();
  }, [inspect, openPrint, report]);

  useEffect(() => {
    window.__pdfOutputPreflightFixture = {
      addTableBlocker() {
        tableRow.classList.add("tiptap-table-row-too-tall");
      },
      resolveAllRisks() {
        imageState = "ready";
        tableRow.classList.remove("tiptap-table-row-too-tall");
      },
      snapshot() {
        return {
          imageState,
          printCount,
          reportStatus: report?.status || "closed",
          issueCodes: report?.issues.map(({ code }) => code) || []
        };
      }
    };
    document.body.dataset.fixtureStatus = "ready";
    updateStatus("fixture 준비 완료");
  }, [report]);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "fixture-print",
        onClick: attemptPrint
      },
      "PDF 출력"
    ),
    React.createElement(PdfOutputPreflightModal, {
      open: Boolean(report),
      report,
      onClose: () => setReport(null),
      onRecheck: attemptPrint,
      onConfirm: confirmPrint
    })
  );
}

createRoot(document.querySelector("#app")).render(
  // DarkModeProvider가 설정에서 테마를 읽으므로 SettingProvider 필요
  React.createElement(
    SettingProvider,
    null,
    React.createElement(
      DarkModeProvider,
      null,
      React.createElement(FixtureApp)
    )
  )
);
