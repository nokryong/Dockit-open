/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sud-ui", () => ({
  Div: ({ children }) => h("div", null, children),
  Input: ({ value, onChange, placeholder }) =>
    h("input", { value, onChange, placeholder }),
  Typography: ({ children }) => h("span", null, children)
}));

vi.mock(
  "../../app/LIB/components/clientLayout/drawer/DrawerTemplate",
  () => ({
    default: ({ content, title }) =>
      h("aside", { "aria-label": title }, content)
  })
);

vi.mock("../../app/LIB/context/PanelContext", () => ({
  usePanels: () => ({
    left: [],
    right: [],
    toggle: vi.fn(),
    setLeft: vi.fn(),
    remove: vi.fn()
  })
}));

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));

vi.mock("../../app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({
    isDarkMode: false,
    currentColors: {
      mint: { 1: "#f0fffc", 6: "#12b8aa", 7: "#009b90" }
    }
  })
}));

const roots = [];

const renderDrawer = async () => {
  const { default: WidgetDrawer } = await import(
    "../../app/LIB/components/clientLayout/drawer/WidgetDrawer.js"
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(
      h(WidgetDrawer, {
        openWidgetDrawer: true,
        setOpenWidgetDrawer: vi.fn()
      })
    );
  });

  return container;
};

const findButtonWithText = (container, label) =>
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent.trim() === label
  );

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => root.unmount());
    container.remove();
  }
});

describe("WidgetDrawer release hierarchy", () => {
  it("AI와 문서 작성을 먼저 열고 도구는 요청 전까지 접어 둔다", async () => {
    const container = await renderDrawer();
    const groupButton = (id) =>
      container.querySelector(`button[aria-controls="widget-tier-${id}"]`);

    expect(groupButton("ai").getAttribute("aria-expanded")).toBe("true");
    expect(groupButton("writing").getAttribute("aria-expanded")).toBe("true");
    expect(groupButton("tools").getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("ChatGPT");
    expect(container.textContent).toContain("한자");
    expect(container.textContent).not.toContain("계산기");

    const aiItem = findButtonWithText(container, "ChatGPT");
    expect(aiItem.className).toContain("border-0");

    const toolsButton = groupButton("tools");
    await act(async () => toolsButton.click());

    expect(toolsButton.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#widget-tier-tools")).not.toBeNull();
    expect(container.textContent).toContain("계산기");

    const toolItem = findButtonWithText(container, "계산기");
    expect(toolItem.className).toContain("border-0");
    expect(toolItem.className).toBe(aiItem.className);
  });

  it("expands matching tiers while searching", async () => {
    const container = await renderDrawer();
    const input = container.querySelector('input[placeholder="도구 검색"]');

    await act(async () => {
      fireEvent.change(input, { target: { value: "계산기" } });
    });

    const toolsButton = container.querySelector(
      'button[aria-controls="widget-tier-tools"]'
    );
    expect(toolsButton.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("계산기");
    expect(
      container.querySelector('button[aria-controls="widget-tier-writing"]')
    ).toBeNull();
    expect(
      container.querySelector('button[aria-controls="widget-tier-ai"]')
    ).toBeNull();
  });

  it("explains how to recover from an empty widget search", async () => {
    const container = await renderDrawer();
    const input = container.querySelector('input[placeholder="도구 검색"]');

    await act(async () => {
      fireEvent.change(input, { target: { value: "없는 도구" } });
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "다른 이름으로 검색해 보세요."
    );
  });
});
