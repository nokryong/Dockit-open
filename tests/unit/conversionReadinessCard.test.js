/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sud-ui", () => ({
  Typography: ({ children, ...props }) => h("span", props, children)
}));

vi.mock("@/app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({ isDarkMode: false })
}));

const roots = [];

const render = async (element) => {
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(element);
  });

  return container;
};

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

describe("ConversionReadinessCard", () => {
  it("collapses zero-warning areas into a single stable row and keeps import apply enabled", async () => {
    const { default: ConversionReadinessCard } = await import(
      "../../app/LIB/components/docs/ConversionReadinessCard.js"
    );

    const container = await render(
      h(ConversionReadinessCard, {
        variant: "import",
        warnings: [],
        onViewDetails: vi.fn(),
        onCancel: vi.fn(),
        onApply: vi.fn()
      })
    );

    const stableRow = container.querySelector(
      '[data-testid="conversion-readiness-stable-areas"]'
    );
    const applyButton = container.querySelector(
      '[data-testid="conversion-readiness-apply"]'
    );

    expect(container.textContent).toContain("가져오기 준비 완료");
    expect(container.textContent).toContain("바로 적용");
    expect(
      container.querySelector('[data-testid="conversion-support-boundary"]')
        ?.textContent
    ).toContain("문서 변환 형식");
    expect(container.textContent).toContain("HWPX와 DOCX");
    expect(container.textContent).toContain("화면 모양을 보장하지 않습니다");
    expect(stableRow).not.toBeNull();
    expect(stableRow.textContent).toContain(
      "✓ 텍스트·스타일·표·목록·이미지·미디어·링크·페이지 설정·기타 개체"
    );
    expect(stableRow.textContent).toContain("그대로 유지");
    expect(
      container.querySelectorAll('[data-testid^="conversion-readiness-area-"]')
    ).toHaveLength(0);
    expect(applyButton.disabled).toBe(false);
  });

  it("groups warnings by functional area with per-area counts and worst status labels", async () => {
    const { default: ConversionReadinessCard } = await import(
      "../../app/LIB/components/docs/ConversionReadinessCard.js"
    );

    const container = await render(
      h(ConversionReadinessCard, {
        variant: "import",
        warnings: [
          { code: "docx-table-style-fallback", severity: "warning" },
          { code: "docx-table-border-fallback", severity: "warning" },
          { code: "docx-image-relationship-fallback", severity: "warning" },
          { code: "docx-link-attribute-fallback", severity: "warning" }
        ],
        onViewDetails: vi.fn(),
        onCancel: vi.fn(),
        onApply: vi.fn()
      })
    );

    const tableRow = container.querySelector(
      '[data-testid="conversion-readiness-area-표"]'
    );
    const imageRow = container.querySelector(
      '[data-testid="conversion-readiness-area-이미지·미디어"]'
    );
    const linkRow = container.querySelector(
      '[data-testid="conversion-readiness-area-링크"]'
    );
    const stableRow = container.querySelector(
      '[data-testid="conversion-readiness-stable-areas"]'
    );

    expect(container.textContent).toContain("⚠ 4개 항목 주의");
    expect(tableRow.textContent).toContain("⚠ 표 (2)");
    expect(tableRow.textContent).toContain("부분 유지");
    expect(imageRow.textContent).toContain("⚠ 이미지·미디어 (1)");
    expect(imageRow.textContent).toContain("자리만 표시");
    expect(linkRow.textContent).toContain("⚠ 링크 (1)");
    expect(linkRow.textContent).toContain("부분 유지");
    expect(stableRow.textContent).toContain("텍스트·스타일·목록·페이지 설정·기타 개체");
  });

  it("renders variant-specific actions for import and export", async () => {
    const { default: ConversionReadinessCard } = await import(
      "../../app/LIB/components/docs/ConversionReadinessCard.js"
    );

    const importContainer = await render(
      h(ConversionReadinessCard, {
        variant: "import",
        warnings: [],
        onViewDetails: vi.fn(),
        onCancel: vi.fn(),
        onApply: vi.fn()
      })
    );
    const exportContainer = await render(
      h(ConversionReadinessCard, {
        variant: "export",
        warnings: [],
        onViewDetails: vi.fn(),
        onClose: vi.fn()
      })
    );

    expect(
      importContainer.querySelector('[data-testid="conversion-readiness-cancel"]')
    ).not.toBeNull();
    expect(
      importContainer.querySelector('[data-testid="conversion-readiness-apply"]')
    ).not.toBeNull();
    expect(
      exportContainer.querySelector('[data-testid="conversion-readiness-details"]')
    ).not.toBeNull();
    expect(
      exportContainer.querySelector('[data-testid="conversion-readiness-close"]')
    ).not.toBeNull();
    expect(
      exportContainer.querySelector('[data-testid="conversion-readiness-apply"]')
    ).toBeNull();
  });

  it("disables import apply when any warning is blocked", async () => {
    const { default: ConversionReadinessCard } = await import(
      "../../app/LIB/components/docs/ConversionReadinessCard.js"
    );

    const onApply = vi.fn();
    const container = await render(
      h(ConversionReadinessCard, {
        variant: "import",
        warnings: [{ code: "import-readiness-blocked", severity: "blocked" }],
        onViewDetails: vi.fn(),
        onCancel: vi.fn(),
        onApply
      })
    );

    const applyButton = container.querySelector(
      '[data-testid="conversion-readiness-apply"]'
    );

    expect(container.textContent).toContain("적용 전 해결 필요 1개 항목");
    expect(applyButton.disabled).toBe(true);

    await act(async () => {
      applyButton.click();
    });

    expect(onApply).not.toHaveBeenCalled();
  });
});
