/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPdfOutputPreflightReport } from "../../app/LIB/utils/pdfOutputPreflightAudit";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sud-ui", () => ({
  Button: ({ children, ...props }) => h("button", props, children),
  Modal: ({ children, open, ariaLabel, ...props }) => open
    ? h("div", { ...props, role: "dialog", "aria-label": ariaLabel }, children)
    : null,
  Typography: ({ as = "span", children, ...props }) => h(as, props, children)
}));

vi.mock("@/app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({ isDarkMode: false })
}));

const roots = [];

const renderModal = async (props) => {
  const { default: PdfOutputPreflightModal } = await import(
    "../../app/LIB/components/docs/PdfOutputPreflightModal.js"
  );
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });
  await act(async () => {
    root.render(h(PdfOutputPreflightModal, props));
  });

  return container;
};

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => root.unmount());
    container.remove();
  }
});

describe("PdfOutputPreflightModal", () => {
  it("shows blockers without a continue-print escape hatch", async () => {
    const onClose = vi.fn();
    const onRecheck = vi.fn();
    const onConfirm = vi.fn();
    const report = createPdfOutputPreflightReport({
      surfaceAvailable: true,
      tableRowTooTallCount: 2,
      failedImageCount: 1
    });
    const container = await renderModal({
      open: true,
      report,
      onClose,
      onRecheck,
      onConfirm
    });

    expect(container.textContent).toContain("PDF 출력 전에 해결해 주세요");
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label")
    ).toBe("PDF 출력 전에 해결해 주세요");
    expect(container.textContent).toContain("출력을 막는 항목이 2종류 있습니다");
    expect(container.textContent).toContain("한 페이지보다 큰 표 행");
    expect(container.textContent).toContain("출력 차단 2개");
    expect(
      container.querySelector('[data-testid="pdf-output-preflight-confirm"]')
    ).toBeNull();

    await act(async () => {
      container
        .querySelector('[data-testid="pdf-output-preflight-recheck"]')
        .click();
    });
    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "닫기")
        .click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit warning acknowledgement before print", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const report = createPdfOutputPreflightReport({
      surfaceAvailable: true,
      pendingImageCount: 1,
      failedFontCount: 1
    });
    const container = await renderModal({
      open: true,
      report,
      onClose,
      onRecheck: vi.fn(),
      onConfirm
    });

    expect(container.textContent).toContain("PDF 출력 전에 확인해 주세요");
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label")
    ).toBe("PDF 출력 전에 확인해 주세요");
    expect(container.textContent).toContain("결과가 달라질 수 있는 항목이 2종류 있습니다");
    expect(container.textContent).toContain("불러오는 중인 이미지");
    expect(container.textContent).toContain("불러오지 못한 글꼴");

    await act(async () => {
      container
        .querySelector('[data-testid="pdf-output-preflight-confirm"]')
        .click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "취소")
        .click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render a ready report", async () => {
    const container = await renderModal({
      open: true,
      report: createPdfOutputPreflightReport({ surfaceAvailable: true }),
      onClose: vi.fn(),
      onRecheck: vi.fn(),
      onConfirm: vi.fn()
    });

    expect(
      container.querySelector('[data-testid="pdf-output-preflight-modal"]')
    ).toBeNull();
  });
});
