/* @vitest-environment jsdom */

import React from "react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

vi.mock("../../app/LIB/components/panel/WidgetCard", () => ({
  default: ({ children, title, titleBtn }) =>
    h("section", null, h("header", null, title, titleBtn), children)
}));

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));

vi.mock("../../app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({ isDarkMode: false })
}));

vi.mock("../../app/LIB/context/LayoutContext", () => ({
  useLayout: () => ({ footerHeight: 40, headerHeight: 48 })
}));

vi.mock("../../app/LIB/context/DocumentContext", () => ({
  useDocument: () => ({
    bulletStyle: { h1: "decimal", h2: "decimal" },
    content: "",
    globalDoc: null
  })
}));

vi.mock("../../app/LIB/constant/uiProps", () => ({
  inputProps: {},
  newShadowDarkMdInset: {},
  newShadowDarkSm: {},
  newShadowLightMdInset: {},
  newShadowLightSm: {},
  withOverlayShadow: () => ({})
}));

vi.mock("@/desktop/dynamic", () => ({
  default: () => {
    const DynamicStub = React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        getAllSheets: () => props.data || []
      }));
      return h("div", { "data-testid": "dynamic-widget" }, "dynamic widget");
    });

    DynamicStub.displayName = "DynamicStub";
    return DynamicStub;
  }
}));

vi.mock("sud-icons", () => ({
  Map: () => h("span"),
  Minus: () => h("span"),
  Plus: () => h("span")
}));

vi.mock("react-icons/md", () => ({
  MdKeyboardCommandKey: () => h("span")
}));

vi.mock("react-icons/tb", () => ({
  TbCalculator: () => h("span"),
  TbDice: () => h("span"),
  TbFileSpreadsheet: () => h("span"),
  TbHexagonNumber1Filled: () => h("span"),
  TbHexagonNumber2Filled: () => h("span"),
  TbHexagonNumber3Filled: () => h("span"),
  TbHexagonNumber4Filled: () => h("span"),
  TbHexagonNumber5Filled: () => h("span"),
  TbHexagonNumber6Filled: () => h("span"),
  TbHexagonNumber7Filled: () => h("span"),
  TbHexagonNumber8Filled: () => h("span"),
  TbHexagonNumber9Filled: () => h("span")
}));

vi.mock("react-icons/hi", () => ({
  HiOutlineDownload: () => h("span"),
  HiOutlineUpload: () => h("span")
}));

vi.mock("react-icons/pi", () => ({
  PiImageFill: () => h("span"),
  PiListNumbersFill: () => h("span"),
  PiTableFill: () => h("span")
}));

vi.mock("react-icons/ri", () => ({
  RiBarChartFill: () => h("span")
}));

vi.mock("react-icons/go", () => ({
  GoTriangleDown: () => h("span"),
  GoTriangleUp: () => h("span")
}));

vi.mock("sud-ui", () => ({
  Button: ({ children, disabled, icon, onClick, ...props }) =>
    h(
      "button",
      { disabled, onClick, type: "button", ...props },
      icon,
      children
    ),
  Card: ({ children, ...props }) => h("div", props, children),
  Div: ({ children, ...props }) => h("div", props, children),
  Divider: ({ content }) => h("div", null, content),
  Input: ({ onChange, onEnter, value, ...props }) =>
    h("input", {
      onChange,
      onKeyDown: (event) => {
        if (event.key === "Enter") onEnter?.(event);
      },
      value,
      ...props
    }),
  Modal: ({ children, open, thumb }) =>
    open ? h("div", null, thumb || children) : null,
  Tabs: ({ options = [], value }) => {
    const activeOption = options.find((option) => option.key === value) || options[0];
    return h("div", null, activeOption?.label, activeOption?.children);
  },
  Tag: ({ children }) => h("span", null, children),
  Typography: ({ children, ...props }) => h("span", props, children),
  toast: {
    danger: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}));

const roots = [];

const renderComponent = async (importPath) => {
  const { default: Component } = await import(importPath);
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(Component));
  });

  return container;
};

const clickText = async (container, text) => {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text
  );

  expect(button).toBeTruthy();

  await act(async () => {
    button.click();
  });
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

describe("local utility widget smoke coverage", () => {
  it("keeps the calculator basic operation usable", async () => {
    const container = await renderComponent(
      "../../app/LIB/components/panel/Calculator.js"
    );

    await clickText(container, "2");
    await clickText(container, "+");
    await clickText(container, "3");
    await clickText(container, "=");

    expect(container.querySelector('[role="status"]').textContent).toBe("5");
  });

  it("keeps the shortcut reference renderable", async () => {
    const container = await renderComponent(
      "../../app/LIB/components/panel/Shortcut.js"
    );

    expect(container.textContent).toContain("Ctrl");
    expect(container.textContent).toContain("z");
  });

  it("keeps the sheet panel behind the dynamic workbook wrapper", () => {
    const source = readFileSync(
      resolve(repoRoot, "app/LIB/components/panel/SheetPanel.js"),
      "utf8"
    );

    expect(source).toContain("dynamic(");
    expect(source).toContain("@fortune-sheet/react");
    expect(source).toContain("showToolbar={true}");
    expect(source).toContain("showFormulaBar={true}");
  });

  it("keeps the index parser producing heading and caption entries", async () => {
    const {
      buildCaptionEntriesFromHtml,
      buildHeadingEntriesFromHtml
    } = await import("../../app/LIB/components/panel/TableOfContentsPanel.js");

    expect(
      buildHeadingEntriesFromHtml(
        "<h1 id='intro'>Intro</h1><h2>Scope</h2>",
        { h1: "decimal", h2: "upper-alpha" }
      )
    ).toEqual([
      expect.objectContaining({
        id: "intro",
        level: 1,
        number: "1",
        text: "Intro"
      }),
      expect.objectContaining({
        level: 2,
        number: "1.A",
        text: "Scope"
      })
    ]);

    expect(
      buildCaptionEntriesFromHtml(
        '<div data-caption-block="true" data-target-type="image" data-target-id="img-1"><span class="caption-block-content">Figure one</span></div>'
      )
    ).toEqual([
      expect.objectContaining({
        targetGroup: "image",
        targetId: "img-1",
        text: "Figure one"
      })
    ]);
  });
});
