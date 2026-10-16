/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  documentContext: null,
  pathname: "/docs/doc-1",
  setFooterHeight: vi.fn()
}));

vi.mock("@/desktop/navigation", () => ({
  usePathname: () => mocks.pathname
}));

vi.mock("sud-icons", () => ({
  Search: () => h("span", { "data-testid": "search-icon" }),
  CloudOutline: () => null,
  Cloudy: () => null,
  Rain: () => null,
  Snow: () => null,
  SunOutline: () => null
}));

vi.mock("sud-ui", () => {
  const MockDiv = React.forwardRef(function MockDiv(
    { children, ...props },
    ref
  ) {
    return h("div", { ...props, ref }, children);
  });

  return {
    Div: MockDiv,
    Divider: ({ vertical, ...props }) =>
      h("span", { ...props, "data-vertical": vertical ? "true" : "false" }),
    Typography: ({ as = "span", children, ...props }) => h(as, props, children)
  };
});

vi.mock("@/app/LIB/context/DocumentContext", () => ({
  useDocument: () => mocks.documentContext
}));

vi.mock("@/app/LIB/context/EditorContext", () => ({
  useEditor: () => ({ editor: null, editorMounted: false })
}));

vi.mock("@/app/LIB/context/CodexContext", () => ({
  useCodex: () => ({ connection: { connected: false } })
}));

vi.mock("@/app/LIB/context/LayoutContext", () => ({
  useLayout: () => ({
    layoutMode: "desktop",
    setFooterHeight: mocks.setFooterHeight
  })
}));

vi.mock("@/app/LIB/utils/editorViewUtils", () => ({
  getEditorViewSafely: () => null
}));

const roots = [];

const createDocumentContext = (overrides = {}) => ({
  content: "<p>hello</p>",
  isSaving: false,
  hasQueuedSave: false,
  lastSaveResult: null,
  ...overrides
});

const renderFooter = async (props = {}) => {
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });

  const { default: Footer } = await import(
    "../../app/LIB/components/clientLayout/Footer.js"
  );

  await act(async () => {
    root.render(
      h(Footer, {
        scale: 1,
        setScale: vi.fn(),
        isMain: false,
        ...props
      })
    );
  });

  return { container };
};

describe("Footer save status", () => {
  beforeEach(() => {
    mocks.pathname = "/docs/doc-1";
    mocks.setFooterHeight.mockReset();
    mocks.documentContext = createDocumentContext();
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    while (roots.length) {
      const { root, container } = roots.pop();
      act(() => root.unmount());
      container.remove();
    }
    vi.resetModules();
  });

  it("renders successful save status in the footer before the page indicator", async () => {
    mocks.documentContext = createDocumentContext({
      lastSaveResult: {
        completedAt: new Date("2026-06-18T05:31:00.000Z").getTime(),
        id: "doc-1",
        ok: true
      }
    });

    const { container } = await renderFooter();
    const status = container.querySelector('[data-testid="write-save-status"]');
    const help = container.querySelector(
      `#${status?.getAttribute("aria-describedby")}`
    );

    expect(status?.textContent).toContain("저장 완료");
    expect(status?.getAttribute("title")).toContain(
      "마지막 저장 요청이 성공했다는 뜻"
    );
    expect(help?.textContent).toContain("최신 내용의 저장을 보장하지 않습니다");
    expect(container.textContent.indexOf("저장 완료")).toBeLessThan(
      container.textContent.indexOf("1/1")
    );
  });

  it("renders queued save status before saving or completed states", async () => {
    mocks.documentContext = createDocumentContext({
      hasQueuedSave: true,
      isSaving: true,
      lastSaveResult: {
        completedAt: new Date("2026-06-18T05:31:00.000Z").getTime(),
        id: "doc-1",
        ok: true
      }
    });

    const { container } = await renderFooter();
    const status = container.querySelector('[data-testid="write-save-status"]');

    expect(status?.textContent).toContain("저장 대기 중");
    expect(status?.textContent).not.toContain("저장 중");
    expect(status?.textContent).not.toContain("저장 완료");
  });

  it("renders failure as a distinct status rather than a saved guarantee", async () => {
    mocks.documentContext = createDocumentContext({
      lastSaveResult: { id: "doc-1", ok: false, completedAt: Date.now() }
    });

    const { container } = await renderFooter();
    const status = container.querySelector('[data-testid="write-save-status"]');

    expect(status?.textContent).toContain("저장 실패");
    expect(status?.getAttribute("aria-label")).toBeNull();
    expect(status?.getAttribute("aria-describedby")).toBe(
      "write-save-status-help"
    );
  });
});
