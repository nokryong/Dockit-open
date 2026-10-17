/* @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { act, createElement as h, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferEditorWrite } from "../../app/LIB/utils/deferEditorWrite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.restoreAllMocks());

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

describe("deferEditorWrite", () => {
  it("runs the write after the current task instead of synchronously", async () => {
    const write = vi.fn();
    deferEditorWrite({ isDestroyed: false }, write);
    expect(write).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("skips the write after cancellation or editor destruction", async () => {
    const cancelled = vi.fn();
    deferEditorWrite({ isDestroyed: false }, cancelled)();
    const editor = { isDestroyed: false };
    const destroyed = vi.fn();
    deferEditorWrite(editor, destroyed);
    editor.isDestroyed = true;
    await flushMicrotasks();
    expect(cancelled).not.toHaveBeenCalled();
    expect(destroyed).not.toHaveBeenCalled();
  });

  // Tiptap's React node views call flushSync while setContent runs, like the write below.
  const renderProbe = async defer => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen = [];
    function Probe() {
      const [value, setValue] = useState("before");
      useEffect(() => {
        const write = () => flushSync(() => setValue("after"));
        if (defer) return deferEditorWrite({ isDestroyed: false }, write);
        write();
      }, []);
      seen.push(value);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => { root.render(h(Probe)); });
    await act(async () => { await flushMicrotasks(); });
    root.unmount();
    const messages = errors.mock.calls.map(args => args.join(" "));
    errors.mockRestore();
    return { seen, messages };
  };

  it("reproduces the React lifecycle error for a synchronous flushSync in an effect", async () => {
    const { messages } = await renderProbe(false);
    expect(messages.some(message => message.includes("flushSync was called from inside a lifecycle method"))).toBe(true);
  });

  it("applies a deferred write without the React lifecycle error", async () => {
    const { seen, messages } = await renderProbe(true);
    expect(seen.at(-1)).toBe("after");
    expect(messages.filter(message => message.includes("flushSync"))).toEqual([]);
  });

  it("keeps ContentEditor's external value sync deferred and cancellable", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/LIB/components/write/ContentEditor.js"), "utf8").replace(/\r\n/g, "\n");
    const start = source.indexOf("// ✨ 외부 value 변경 시 동기화");
    const effect = source.slice(start, source.indexOf("}, [value, editor, onNotePersistenceRejected, onNotePersistenceStatus]);", start));
    expect(start).toBeGreaterThan(-1);
    expect(effect).toMatch(/return deferEditorWrite\(editor, \(\) => \{[\s\S]*restoreValidatedNotePersistenceHtml\(editor, value\)/);
  });
});
