/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  editor: null,
  editorContext: null,
  insertContentAt: vi.fn(),
  run: vi.fn(),
  updateChartBlock: vi.fn()
}));

vi.mock("../../app/LIB/context/EditorContext", () => ({
  useEditor: () => mocks.editorContext
}));

vi.mock("../../app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({
    currentColors: {
      white: {
        4: "#dddddd",
        6: "#999999",
        7: "#777777",
        9: "#f5f5f5",
        10: "#ffffff"
      }
    },
    isDarkMode: false
  })
}));

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));

vi.mock("../../app/LIB/constant/uiProps", () => ({
  newShadowDarkSm: {},
  newShadowLightSm: {}
}));

vi.mock("../../app/LIB/components/panel/WidgetCard", () => ({
  default: ({ children }) => h("section", null, children)
}));

vi.mock("../../app/LIB/components/panel/ChartComponent/Chart", () => {
  const MockChart = React.forwardRef(function MockChart(
    { chartType, tableData },
    ref
  ) {
    return h("div", {
      "data-chart-type": chartType,
      "data-row-count": String(tableData.length),
      ref
    });
  });

  return {
    default: MockChart
  };
});

vi.mock("react-icons/tb", () => ({
  TbChartArea: () => h("span"),
  TbChartBar: () => h("span"),
  TbChartDotsFilled: () => h("span"),
  TbChartLine: () => h("span"),
  TbChartPie: () => h("span"),
  TbChartRadar: () => h("span")
}));

vi.mock("sud-ui", () => ({
  Button: ({ children, onClick, ...props }) =>
    h("button", { onClick, type: "button", ...props }, children),
  Card: ({ children }) => h("div", null, children),
  ColorPicker: ({ children }) => h("div", null, children),
  Divider: () => h("hr"),
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
  Typography: ({ children }) => h("span", null, children)
}));

const roots = [];

const tableCell = (textContent) => ({ textContent });
const tableRow = (...cells) => ({
  child: (index) => tableCell(cells[index]),
  childCount: cells.length
});
const tableNode = (...rows) => ({
  child: (index) => rows[index],
  childCount: rows.length,
  type: { name: "table" }
});

const renderChartPanel = async () => {
  const { default: ChartPanel } = await import(
    "../../app/LIB/components/panel/ChartPanel.js"
  );
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(ChartPanel));
  });

  return container;
};

beforeEach(() => {
  mocks.insertContentAt.mockClear();
  mocks.run.mockClear();
  mocks.updateChartBlock.mockClear();
  mocks.editor = {
    chain: () => ({
      focus: () => ({
        insertContentAt: (...args) => {
          mocks.insertContentAt(...args);
          return { run: mocks.run };
        }
      })
    }),
    commands: {
      updateChartBlock: mocks.updateChartBlock
    }
  };
  mocks.editorContext = {
    editor: mocks.editor,
    selectedObject: null
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

describe("ChartPanel lint regression guard", () => {
  it("extracts selected table data and inserts a chart block after the table", async () => {
    mocks.editorContext = {
      editor: mocks.editor,
      selectedObject: {
        node: tableNode(tableRow("label", "sales"), tableRow("Q1", "10")),
        to: 24
      }
    };

    const container = await renderChartPanel();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const inputs = [...container.querySelectorAll("input")].map(
      (input) => input.value
    );
    expect(inputs).toContain("label");
    expect(inputs).toContain("sales");
    expect(inputs).toContain("Q1");
    expect(inputs).toContain("10");

    const insertButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("삽입")
    );

    await act(async () => {
      insertButton.click();
    });

    expect(mocks.insertContentAt).toHaveBeenCalledWith(24, {
      attrs: expect.objectContaining({
        chartType: "bar",
        tableData: JSON.stringify([
          ["label", "sales"],
          ["Q1", "10"]
        ])
      }),
      type: "chartBlock"
    });
    expect(mocks.run).toHaveBeenCalled();
  });

  it("loads selected chart attrs and updates the existing chart block", async () => {
    mocks.editorContext = {
      editor: mocks.editor,
      selectedObject: {
        from: 12,
        node: {
          attrs: {
            chartColors: JSON.stringify(["#111111"]),
            chartType: "line",
            isAxesSwapped: true,
            tableData: JSON.stringify([
              ["label", "sales"],
              ["Q1", "10"]
            ])
          },
          type: { name: "chartBlock" }
        }
      }
    };

    const container = await renderChartPanel();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector("[data-chart-type]")).toBeNull();

    const updateButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("업데이트")
    );

    await act(async () => {
      updateButton.click();
    });

    expect(mocks.updateChartBlock).toHaveBeenCalledWith(12, {
      chartColors: JSON.stringify(["#111111"]),
      tableData: JSON.stringify([
        ["label", "sales"],
        ["Q1", "10"]
      ])
    });
  });
});
