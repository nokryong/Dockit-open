/* @vitest-environment jsdom */
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import useContextMenuDismiss from "../../app/LIB/hook/useContextMenuDismiss";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
const mount = async (open, onClose) => {
  function Probe() {
    useContextMenuDismiss(open, onClose);
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(async () => { root.render(h(Probe)); });
};
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => act(() => root?.unmount()));

describe("useContextMenuDismiss", () => {
  it("closes after a left click so the clicked menu action runs first", async () => {
    const onClose = vi.fn();
    await mount(true, onClose);
    window.dispatchEvent(new MouseEvent("click", { button: 0 }));
    expect(onClose).not.toHaveBeenCalled();
    await nextTask();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, another context menu, and window blur, but not on other mouse buttons", async () => {
    const onClose = vi.fn();
    await mount(true, onClose);
    window.dispatchEvent(new MouseEvent("click", { button: 2 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTask();
    expect(onClose).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(new MouseEvent("contextmenu"));
    window.dispatchEvent(new Event("blur"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does nothing while the menu is closed", async () => {
    const onClose = vi.fn();
    await mount(false, onClose);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(new MouseEvent("click", { button: 0 }));
    await nextTask();
    expect(onClose).not.toHaveBeenCalled();
  });
});
