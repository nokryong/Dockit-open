export const getEditorViewSafely = (editor) => {
  if (!editor || editor.isDestroyed) {
    return null;
  }

  try {
    return editor.view;
  } catch {
    return null;
  }
};

export const hasEditorView = (editor) => Boolean(getEditorViewSafely(editor));
