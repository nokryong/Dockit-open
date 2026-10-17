// Tiptap renders React node views with flushSync, which React rejects while it is
// committing. Effects that write editor content run the write in a microtask instead.
// Returns a cancel function for the effect cleanup.
export function deferEditorWrite(editor, write) {
  let cancelled = false;
  queueMicrotask(() => {
    if (cancelled || !editor || editor.isDestroyed) return;
    write();
  });
  return () => {
    cancelled = true;
  };
}
