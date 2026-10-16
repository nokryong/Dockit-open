import { describe, expect, it, vi } from "vitest";

import { getElectronListenerCleanup } from "../../app/LIB/utils/electronListenerUtils.js";

describe("getElectronListenerCleanup", () => {
  it("returns a function subscription as-is", () => {
    const cleanup = vi.fn();

    expect(getElectronListenerCleanup(cleanup)).toBe(cleanup);
  });

  it("wraps unsubscribe-style subscriptions", () => {
    const unsubscribe = vi.fn();
    const cleanup = getElectronListenerCleanup({ unsubscribe });

    cleanup?.();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("wraps dispose-style subscriptions", () => {
    const dispose = vi.fn();
    const cleanup = getElectronListenerCleanup({ dispose });

    cleanup?.();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("wraps off-style subscriptions", () => {
    const off = vi.fn();
    const cleanup = getElectronListenerCleanup({ off });

    cleanup?.();

    expect(off).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for unsupported values", () => {
    expect(getElectronListenerCleanup(null)).toBeUndefined();
    expect(getElectronListenerCleanup({})).toBeUndefined();
  });
});
