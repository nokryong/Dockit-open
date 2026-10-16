import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateToCreatedDocument } from "../../app/docs/documentNavigation.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("navigateToCreatedDocument", () => {
  it("resolves only after the browser path reaches the created document", async () => {
    vi.useFakeTimers();
    let currentPathname = "/docs";
    const push = vi.fn((targetPath) => {
      setTimeout(() => {
        currentPathname = targetPath;
      }, 100);
    });

    const navigationPromise = navigateToCreatedDocument({
      documentId: "document 1",
      push,
      getCurrentPathname: () => currentPathname,
      timeoutMs: 1000,
      pollIntervalMs: 25
    });

    expect(push).toHaveBeenCalledWith("/docs/document%201");

    await vi.advanceTimersByTimeAsync(99);
    let settled = false;
    navigationPromise.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(navigationPromise).resolves.toBe("/docs/document%201");
  });

  it("rejects when the browser path does not change before the timeout", async () => {
    vi.useFakeTimers();
    const push = vi.fn();
    const navigationPromise = navigateToCreatedDocument({
      documentId: "document-2",
      push,
      getCurrentPathname: () => "/docs",
      timeoutMs: 100,
      pollIntervalMs: 25
    });
    const rejection = expect(navigationPromise).rejects.toThrow(
      "문서 화면 이동을 확인하지 못했습니다."
    );

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(push).toHaveBeenCalledWith("/docs/document-2");
  });
});
