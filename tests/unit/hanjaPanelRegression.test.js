/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  editorContext: null,
  insertContent: vi.fn(),
  run: vi.fn()
}));

vi.mock("@/app/LIB/context/EditorContext", () => ({
  useEditor: () => mocks.editorContext
}));

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));

vi.mock("../../app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({ isDarkMode: false })
}));

vi.mock("../../app/LIB/constant/hanjaDictionary", () => ({
  hanjaList: [
    { char: "日", meaning: [{ def: "날", kor: "일" }] },
    { char: "月", meaning: [{ def: "달", kor: "월" }] }
  ]
}));

vi.mock("@/app/LIB/constant/icons", () => ({
  Hanja: () => h("span")
}));

vi.mock("../../app/LIB/constant/uiProps", () => ({
  inputProps: {},
  newShadowDarkSm: {},
  newShadowLightSm: {}
}));

vi.mock("../../app/LIB/components/panel/WidgetCard", () => ({
  default: ({ children }) => h("section", null, children)
}));

vi.mock("sud-ui", () => ({
  Button: ({ children, onClick, ...props }) =>
    h("button", { onClick, type: "button", ...props }, children),
  Card: ({ children }) => h("div", null, children),
  Input: ({ onChange, value, ...props }) =>
    h("input", {
      onChange,
      value,
      ...props
    }),
  Segmented: ({ onChange, options, value }) =>
    h(
      "div",
      null,
      options.map((option) =>
        h(
          "button",
          {
            "aria-pressed": value === option.value,
            key: option.value,
            onClick: () => onChange(option.value),
            type: "button"
          },
          option.value
        )
      )
    ),
  Typography: ({ children, ...props }) => h("span", props, children)
}));

const roots = [];

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const changeInput = async (input, value) => {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const renderHanjaPanel = async () => {
  const { default: HanjaPanel } = await import(
    "../../app/LIB/components/panel/HanjaPanel.js"
  );
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(HanjaPanel));
  });

  return container;
};

beforeEach(() => {
  global.ResizeObserver = ResizeObserverMock;
  global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  mocks.insertContent.mockClear();
  mocks.run.mockClear();
  mocks.editorContext = {
    editor: {
      chain: () => ({
        focus: () => ({
          insertContent: (...args) => {
            mocks.insertContent(...args);
            return { run: mocks.run };
          }
        })
      }),
      state: {
        doc: {
          textBetween: () => ""
        },
        selection: {
          empty: true,
          from: 1,
          to: 1
        }
      }
    }
  };
});

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

describe("HanjaPanel lint regression guard", () => {
  it("selects the first matching result after search input changes", async () => {
    const container = await renderHanjaPanel();
    const searchInput = container.querySelector("input");

    await changeInput(searchInput, "일");

    expect(container.textContent).toContain("日");
    expect(container.textContent).toContain("날");
  });

  it("inserts the selected Hanja when Enter is pressed", async () => {
    const container = await renderHanjaPanel();
    const searchInput = container.querySelector("input");

    await changeInput(searchInput, "일");

    const listContainer = container.querySelector("[tabindex='0']");
    await act(async () => {
      listContainer.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Enter"
        })
      );
    });

    expect(mocks.insertContent).toHaveBeenCalledWith("日");
    expect(mocks.run).toHaveBeenCalled();
  });
});
