/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/app/LIB/utils/lottieUtils", () => ({
  loadAndColorifyLottie: vi.fn(async (jsonPath, colorMapping) => ({
    colorMapping,
    jsonPath
  }))
}));

const roots = [];

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const renderHookHarness = async (props) => {
  const { default: useColorizedLottie } = await import(
    "../../app/LIB/hook/useColorizedLottie.js"
  );
  const container = document.createElement("div");
  const root = createRoot(container);

  const Harness = ({ colorMapping, jsonPath }) => {
    const data = useColorizedLottie(jsonPath, colorMapping);
    return h("pre", null, data ? JSON.stringify(data) : "loading");
  };

  document.body.appendChild(container);
  roots.push({ container, root });

  await act(async () => {
    root.render(h(Harness, props));
  });
  await flushEffects();

  return { container, root, Harness };
};

afterEach(() => {
  vi.clearAllMocks();

  while (roots.length > 0) {
    const { container, root } = roots.pop();
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

describe("useColorizedLottie lint regression guard", () => {
  it("does not reload on rerender when the default color mapping is used", async () => {
    const { loadAndColorifyLottie } = await import(
      "@/app/LIB/utils/lottieUtils"
    );
    const { Harness, root } = await renderHookHarness({
      jsonPath: "/lottie/default.json"
    });

    await act(async () => {
      root.render(h(Harness, { jsonPath: "/lottie/default.json" }));
    });
    await flushEffects();

    expect(loadAndColorifyLottie).toHaveBeenCalledTimes(1);
    expect(loadAndColorifyLottie).toHaveBeenCalledWith(
      "/lottie/default.json",
      []
    );
  });

  it("reloads when a caller provides a new memoized color mapping reference", async () => {
    const { loadAndColorifyLottie } = await import(
      "@/app/LIB/utils/lottieUtils"
    );
    const firstMapping = [{ from: "#000000", to: "#ffffff" }];
    const secondMapping = [{ from: "#111111", to: "#eeeeee" }];
    const { Harness, root } = await renderHookHarness({
      colorMapping: firstMapping,
      jsonPath: "/lottie/theme.json"
    });

    await act(async () => {
      root.render(
        h(Harness, {
          colorMapping: secondMapping,
          jsonPath: "/lottie/theme.json"
        })
      );
    });
    await flushEffects();

    expect(loadAndColorifyLottie).toHaveBeenCalledTimes(2);
    expect(loadAndColorifyLottie).toHaveBeenLastCalledWith(
      "/lottie/theme.json",
      secondMapping
    );
  });
});
