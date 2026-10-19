/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sud-ui", () => ({
  Button: ({ children, colorType, disabled, icon, onClick, ...props }) =>
    h(
      "button",
      {
        "data-color-type": colorType || "",
        disabled,
        onClick,
        type: "button",
        ...props
      },
      icon,
      children
    ),
  Card: ({ children }) => h("div", null, children),
  Div: ({ children, ...props }) => h("div", props, children),
  Input: ({ onChange, suffix, value }) =>
    h("input", { "aria-label": suffix, onChange, value }),
  Modal: ({ children, open }) => (open ? h("div", null, children) : null),
  Progress: () => h("div", { "data-testid": "progress" }),
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

vi.mock("sud-icons", () => ({
  TimerOutline: () => h("span")
}));

vi.mock("react-icons/pi", () => ({
  PiPauseFill: () => h("span"),
  PiPlayFill: () => h("span"),
  PiStopFill: () => h("span")
}));

vi.mock("react-icons/lu", () => ({
  LuAlarmClockCheck: () => h("span")
}));

vi.mock("../../app/LIB/components/panel/WidgetCard", () => ({
  default: ({ children }) => h("section", null, children)
}));

vi.mock("../../app/LIB/context/SettingContext", () => ({
  useSetting: () => ({ setting: { theme: "mint" } })
}));

vi.mock("../../app/LIB/context/DarkModeContext", () => ({
  useDarkMode: () => ({ isDarkMode: false })
}));

const roots = [];

const renderTimer = async () => {
  const { default: Timer } = await import(
    "../../app/LIB/components/panel/Timer.js"
  );
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(Timer));
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

afterEach(() => {
  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

describe("Timer lint regression guard", () => {
  it("does not reset the displayed timer value while only editing input fields", async () => {
    const container = await renderTimer();
    const secondInput = container.querySelectorAll("input")[2];

    expect(container.textContent).toContain("00:00:00.000");

    await changeInput(secondInput, "5");

    expect(container.textContent).toContain("00:00:00.000");
    expect(container.textContent).not.toContain("00:00:05.000");
  });

  it("still uses the latest input value when reset is explicitly clicked", async () => {
    const container = await renderTimer();
    const secondInput = container.querySelectorAll("input")[2];
    const resetButton = container.querySelector('button[data-color-type="danger"]');

    await changeInput(secondInput, "5");
    await act(async () => {
      resetButton.click();
    });

    expect(container.textContent).toContain("00:00:05.000");
  });

  it("uses the latest input value when switching back to timer mode", async () => {
    const container = await renderTimer();
    const secondInput = container.querySelectorAll("input")[2];
    const stopwatchButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "stopwatch"
    );
    const timerButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "timer"
    );

    await changeInput(secondInput, "5");
    await act(async () => {
      stopwatchButton.click();
    });
    await act(async () => {
      timerButton.click();
    });

    expect(container.textContent).toContain("00:00:05.000");
  });
});
