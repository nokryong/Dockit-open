/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  charContext: null,
  editorContext: null,
  insertContent: vi.fn(),
  insertContentAt: vi.fn(),
  insertInlineMath: vi.fn(),
  objectDispatch: vi.fn(),
  run: vi.fn(),
  setChar: vi.fn(),
  setNodeMarkup: vi.fn(),
  setTextSelection: vi.fn(),
  toastDanger: vi.fn()
}));

vi.mock("../../app/LIB/context/EditorContext", () => ({
  useEditor: () => mocks.editorContext
}));

vi.mock("@/app/LIB/context/EditorContext", () => ({
  useEditor: () => mocks.editorContext
}));

vi.mock("@/app/LIB/context/CharContext", () => ({
  useChar: () => mocks.charContext
}));

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));

vi.mock("../../app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({
    isDarkMode: false
  })
}));

vi.mock("../../app/LIB/components/panel/WidgetCard", () => ({
  default: ({ children, titleBtn }) => h("section", null, titleBtn, children)
}));

vi.mock("../../app/LIB/components/panel/EditorComponent/ShapeEditor", () => ({
  default: ({ onUpdateStyle }) =>
    h(
      "button",
      {
        onClick: () => onUpdateStyle({ borderWidth: "2" }),
        type: "button"
      },
      "shape update"
    )
}));

vi.mock("../../app/LIB/components/panel/EditorComponent/TableEditor", () => ({
  default: () => h("div", null, "table editor")
}));

vi.mock("../../app/LIB/components/common/semantic/SemanticAttributesEditor", () => ({
  default: () => h("div", { "data-testid": "semantic-editor" }, "semantic editor")
}));

vi.mock("../../app/LIB/constant/uiProps", () => ({
  inputProps: {},
  newShadowDarkSm: {},
  newShadowLightSm: {}
}));

vi.mock("react-icons/tb", () => ({
  TbEdit: () => h("span"),
  TbMath: () => h("span"),
  TbMathSymbols: () => h("span"),
  TbChevronLeft: () => h("span"),
  TbChevronRight: () => h("span"),
  TbReplace: () => h("span")
}));

vi.mock("react-icons/md", () => ({
  MdAdd: () => h("span")
}));

vi.mock("sud-icons", () => ({
  SettingOutline: () => h("span")
}));

vi.mock("sud-ui", () => ({
  Button: ({ children, icon, onClick, ...props }) =>
    h("button", { onClick, type: "button", ...props }, icon, children),
  Divider: () => h("hr"),
  Input: ({ label, onChange, onEnter, onKeyDown, value, ...props }) =>
    h("input", {
      "aria-label": label,
      onChange,
      onKeyDown: (event) => {
        onKeyDown?.(event);
        if (event.key === "Enter") onEnter?.(event);
      },
      value,
      ...props
    }),
  Switch: ({ onChange }) =>
    h("button", { onClick: onChange, type: "button" }, "toggle replace"),
  Typography: ({ children }) => h("span", null, children),
  toast: {
    danger: mocks.toastDanger
  }
}));

const roots = [];

const createChain = () => {
  const chain = {
    focus: () => chain,
    insertContent: (...args) => {
      mocks.insertContent(...args);
      return chain;
    },
    insertInlineMath: (...args) => {
      mocks.insertInlineMath(...args);
      return chain;
    },
    run: mocks.run,
    setTextSelection: (...args) => {
      mocks.setTextSelection(...args);
      return chain;
    }
  };

  return chain;
};

const createTextDoc = (text) => ({
  descendants: (callback) => {
    callback({ childCount: 1, isTextblock: true }, 0);
    callback({ isText: true, text }, 1);
  }
});

const renderComponent = async (importPath) => {
  const { default: Component } = await import(importPath);
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(Component));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return container;
};

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

const pressEnter = async (input) => {
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Enter"
      })
    );
  });
};

beforeEach(() => {
  mocks.insertContent.mockReset();
  mocks.insertContentAt.mockReset();
  mocks.insertInlineMath.mockReset();
  mocks.objectDispatch.mockReset();
  mocks.run.mockReset();
  mocks.setChar.mockReset();
  mocks.setNodeMarkup.mockReset();
  mocks.setTextSelection.mockReset();
  mocks.toastDanger.mockReset();
  mocks.charContext = {
    char: { char: [{ char: "Ω", key: "omega" }] },
    charLoading: false,
    setChar: mocks.setChar
  };
  mocks.editorContext = {
    editor: {
      chain: createChain
    }
  };
  global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  global.scrollTo = vi.fn();
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

describe("editor mutation widget guards", () => {
  it("inserts LATEX only after the explicit Enter action", async () => {
    const container = await renderComponent(
      "../../app/LIB/components/panel/LatexPanel.js"
    );
    const input = container.querySelector("input");

    await changeInput(input, "x^2");

    expect(mocks.insertInlineMath).not.toHaveBeenCalled();

    await pressEnter(input);

    expect(mocks.insertInlineMath).toHaveBeenCalledWith({ latex: "x^2" });
    expect(mocks.run).toHaveBeenCalled();
  });

  it("inserts special characters only after the explicit character click", async () => {
    const container = await renderComponent(
      "../../app/LIB/components/panel/SpecialChar.js"
    );

    expect(mocks.insertContent).not.toHaveBeenCalled();

    const omegaButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("Ω")
    );

    await act(async () => {
      omegaButton.click();
    });

    expect(mocks.insertContent).toHaveBeenCalledWith("Ω");
    expect(mocks.run).toHaveBeenCalled();
  });

  it("runs find-and-replace document mutation only from replace controls", async () => {
    const chain = createChain();
    mocks.editorContext = {
      editor: {
        chain: () => chain,
        state: {
          doc: createTextDoc("alpha beta alpha")
        },
        view: {
          coordsAtPos: () => ({ left: 0, top: 0 }),
          dom: {
            closest: () => null,
            parentElement: null
          }
        }
      }
    };
    const container = await renderComponent(
      "../../app/LIB/components/panel/FindAndReplace.js"
    );
    const findInput = container.querySelector("input");

    await changeInput(findInput, "alpha");

    const findButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("찾기")
    );
    await act(async () => {
      findButton.click();
    });

    expect(mocks.insertContent).not.toHaveBeenCalled();

    const replaceToggle = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("toggle replace")
    );
    await act(async () => {
      replaceToggle.click();
    });

    const replaceInput = [...container.querySelectorAll("input")].find(
      (input) => input.getAttribute("aria-label") === "바꿀 내용"
    );
    await changeInput(replaceInput, "gamma");

    const replaceButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("바꾸기")
    );
    await act(async () => {
      replaceButton.click();
    });

    expect(mocks.insertContent).toHaveBeenCalledWith("gamma");
  });

  it("dispatches object edits only from explicit object editor controls", async () => {
    const tr = {
      doc: {
        nodeAt: () => ({
          attrs: { src: "data:image/png;base64,abc" },
          type: { name: "image" }
        })
      },
      setMeta: vi.fn(),
      setNodeMarkup: mocks.setNodeMarkup,
      setSelection: vi.fn()
    };
    mocks.editorContext = {
      editor: {
        off: vi.fn(),
        on: vi.fn(),
        state: {
          doc: tr.doc,
          selection: {},
          tr
        },
        view: {
          dispatch: mocks.objectDispatch
        }
      },
      selectedObject: {
        from: 5,
        node: { type: { name: "image" } }
      }
    };
    const container = await renderComponent(
      "../../app/LIB/components/panel/ObjectEditor.js"
    );

    expect(mocks.objectDispatch).not.toHaveBeenCalled();

    const updateButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("shape update")
    );
    await act(async () => {
      updateButton.click();
    });

    expect(mocks.setNodeMarkup).toHaveBeenCalledWith(
      5,
      undefined,
      expect.objectContaining({ borderWidth: 2 })
    );
    expect(mocks.objectDispatch).toHaveBeenCalledWith(tr);
  });
});
