/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sud-ui", () => ({
  Button: ({ children, icon, ...props }) => h("button", props, icon, children),
  Card: ({ children }) => h("div", null, children),
  ColorPicker: ({ children }) => h("div", null, children),
  Divider: () => h("hr"),
  Input: (props) => h("input", props),
  Select: ({ options = [] }) =>
    h(
      "select",
      null,
      options.map((option) =>
        h("option", { key: option.value, value: option.value }, option.label)
      )
    ),
  Switch: () => h("input", { type: "checkbox" }),
  Tabs: ({ options }) => h("div", null, options.map((option) => h("section", { key: option.key }, option.children))),
  Tooltip: ({ children }) => h("div", null, children),
  Typography: ({ children, ...props }) => h("span", props, children)
}));

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));
vi.mock("@tiptap/pm/tables", () => ({
  CellSelection: class {},
  TableMap: {},
  cellAround: vi.fn()
}));

const roots = [];

afterEach(() => {
  while (roots.length) {
    const { container, root } = roots.pop();
    act(() => root.unmount());
    container.remove();
  }
});

describe("TableEditor cell border width focus", () => {
  it("keeps focus through repeated ArrowUp changes without refocusing the editor", async () => {
    const focus = vi.fn();
    const run = vi.fn();
    const chain = {
      focus,
      setCellAttribute: vi.fn(() => chain),
      run
    };
    const editor = {
      chain: vi.fn(() => chain),
      on: vi.fn(),
      off: vi.fn(),
      state: { selection: { $from: { depth: 0 }, node: null } }
    };
    const { default: TableEditor } = await import(
      "../../app/LIB/components/panel/EditorComponent/TableEditor.js"
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);
    roots.push({ container, root });

    await act(async () => {
      root.render(
        h(TableEditor, {
          editor,
          selectedObject: null,
          isDarkMode: false,
          setting: { theme: "mint" }
        })
      );
    });

    expect(container.textContent).toContain("셀 테두리");
    expect(container.textContent).toContain("방향");
    expect(container.textContent).toContain("색상");
    expect(container.textContent).toContain("두께");
    expect(container.textContent).toContain("선 스타일");
    expect(container.textContent).toContain("테두리 지우기");
    expect(container.textContent).toContain("전체");
    expect(container.textContent).toContain("실선");
    expect(container.textContent).not.toContain("Cell border");

    const input = container.querySelector('input[aria-label="셀 테두리 두께"]');
    input.focus();
    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowUp" });
      fireEvent.change(input, { target: { value: "2" } });
      fireEvent.keyDown(input, { key: "ArrowUp" });
      fireEvent.change(input, { target: { value: "3" } });
    });

    expect(document.activeElement).toBe(input);
    expect(editor.chain).toHaveBeenCalledTimes(2);
    expect(focus).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
