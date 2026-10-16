/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sud-ui", () => ({
  Button: ({ children, icon, onClick }) =>
    h("button", { onClick }, icon, children),
  Divider: ({ children }) => h("div", null, children),
  Div: ({ children, ...props }) => h("div", props, children),
  Tooltip: ({ children }) => h("div", null, children),
  Typography: ({ children }) => h("span", null, children)
}));

vi.mock("@/app/LIB/constant/uiProps", () => ({
  withOverlayShadow: (style = {}) => style
}));

vi.mock("@/app/LIB/utils/editorViewUtils", () => ({
  hasEditorView: () => false
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

describe("Toolbar primitives regression guards", () => {
  it("renders data-testid on a stable wrapper around icon buttons", async () => {
    const { ToolbarIconButton } = await import(
      "../../app/LIB/components/common/toolbar/ToolbarPrimitives.js"
    );
    const onClick = vi.fn();
    const container = await render(
      h(ToolbarIconButton, {
        "data-testid": "write-save-button",
        label: "S",
        onClick,
        skipEditorCheck: true
      })
    );
    const target = container.querySelector(
      '[data-testid="write-save-button"]'
    );

    expect(target).not.toBeNull();
    expect(target.tagName).toBe("SPAN");

    await act(async () => {
      target.querySelector("button").click();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
