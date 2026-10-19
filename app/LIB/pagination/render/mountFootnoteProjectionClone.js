export const mountFootnoteProjectionClone = (host, projection, { print = false } = {}) => {
  const source = print ? projection?.printClone : projection?.clone;
  if (!host || !source) return () => {};
  const clone = source.cloneNode(true);
  clone.classList.add(print ? "dockit-footnote-print-projection__content" : "dockit-footnote-screen-projection__content");
  clone.style.transform = `translateY(${-projection.offsetTop}px)`;
  host.replaceChildren(clone);
  return () => host.replaceChildren();
};

const FOOTNOTE_BODY_SELECTOR =
  '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]';

const canonicalPlacements = new WeakMap();

const findCanonicalBody = (editorRoot, noteId) =>
  [...(editorRoot?.querySelectorAll?.(FOOTNOTE_BODY_SELECTOR) || [])]
    .find((element) =>
      element.getAttribute("data-dockit-note-id") === noteId
    ) || null;

const resolveEditorRoot = (host, explicitEditorRoot) => {
  if (explicitEditorRoot?.matches?.(".ProseMirror")) {
    return explicitEditorRoot;
  }
  return host?.closest?.(".tiptap-container")?.querySelector?.(".ProseMirror") || null;
};

export const restoreCanonicalFootnoteBodies = (editorRoot) => {
  const placements = canonicalPlacements.get(editorRoot);
  if (!placements) return;
  [...placements.values()].forEach((restore) => restore());
};

// 살아 있는 NodeView는 ProseMirror DOM 안에 유지
// (React 페이지 틀로 옮기면 DOMObserver가 일반 편집을 외부 변경으로 처리함)
export const mountCanonicalFootnoteBody = (
  host,
  projection,
  { editorRoot: explicitEditorRoot = null } = {}
) => {
  const noteId = typeof projection === "string"
    ? projection
    : projection?.noteId;
  const editorRoot = resolveEditorRoot(host, explicitEditorRoot);
  const body = findCanonicalBody(editorRoot, noteId);
  if (!host || !body || !noteId) return () => {};

  canonicalPlacements.get(editorRoot)?.get(noteId)?.();
  const slotRect = host.getBoundingClientRect();
  if (!(slotRect.width > 0) || !(slotRect.height > 0)) return () => {};

  let placements = canonicalPlacements.get(editorRoot);
  if (!placements) {
    placements = new Map();
    canonicalPlacements.set(editorRoot, placements);
  }

  const previousStyle = body.getAttribute("style");
  const previousProjectionState = body.getAttribute(
    "data-dockit-footnote-projection-canonical"
  );
  body.setAttribute("data-dockit-footnote-projection-canonical", "true");
  body.style.position = "absolute";
  body.style.zIndex = "4";

  const offsetParent = body.offsetParent || editorRoot;
  const offsetParentRect = offsetParent.getBoundingClientRect();
  const scaleX = offsetParent.offsetWidth > 0 && offsetParentRect.width > 0
    ? offsetParentRect.width / offsetParent.offsetWidth
    : 1;
  const scaleY = offsetParent.offsetHeight > 0 && offsetParentRect.height > 0
    ? offsetParentRect.height / offsetParent.offsetHeight
    : scaleX;
  const slotWidth = slotRect.width / scaleX;
  body.style.left = `${(slotRect.left - offsetParentRect.left) / scaleX + offsetParent.scrollLeft}px`;
  body.style.top = `${(slotRect.top - offsetParentRect.top) / scaleY + offsetParent.scrollTop}px`;
  body.style.width = `${slotWidth}px`;
  body.style.minWidth = `${slotWidth}px`;
  body.style.maxWidth = `${slotWidth}px`;
  body.style.margin = "0";
  body.style.boxSizing = "border-box";
  body.style.setProperty(
    "--dockit-footnote-canonical-fragment-height",
    `${Number.isFinite(projection?.height) ? projection.height : slotRect.height}px`
  );

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (previousProjectionState === null) {
      body.removeAttribute("data-dockit-footnote-projection-canonical");
    } else {
      body.setAttribute(
        "data-dockit-footnote-projection-canonical",
        previousProjectionState
      );
    }
    if (previousStyle === null) body.removeAttribute("style");
    else body.setAttribute("style", previousStyle);
    if (placements.get(noteId) === restore) placements.delete(noteId);
    if (placements.size === 0) canonicalPlacements.delete(editorRoot);
  };
  placements.set(noteId, restore);
  return restore;
};

export const focusCanonicalFootnoteBody = (editor, noteId) => {
  if (!editor?.view?.dom || !noteId) return false;
  if (
    editor.isEditable &&
    editor.storage?.noteInteraction?.focusNoteBody?.(editor, noteId)
  ) {
    return true;
  }

  const body = findCanonicalBody(editor.view.dom, noteId);
  if (!body) return false;
  if (editor.isEditable) {
    let bodyPosition = null;
    editor.state.doc.descendants((node, position) => {
      if (
        node.type.name === "noteBody" &&
        node.attrs?.noteId === noteId
      ) {
        bodyPosition = position;
        return false;
      }
      return true;
    });
    if (Number.isInteger(bodyPosition)) {
      return editor.chain()
        .focus()
        .setTextSelection(bodyPosition + 2)
        .scrollIntoView()
        .run();
    }
  }
  body.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
};

export const focusFootnoteContinuationAtPoint = ({
  editor,
  root,
  clientX,
  clientY
}) => {
  if (
    !root?.querySelectorAll ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY)
  ) {
    return false;
  }
  const continuation = [...root.querySelectorAll(
    ".dockit-footnote-screen-projection--continuation[data-footnote-id]"
  )].reverse().find((element) => {
    const rect = element.getBoundingClientRect();
    return clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
  });
  const noteId = continuation?.getAttribute("data-footnote-id");
  return noteId ? focusCanonicalFootnoteBody(editor, noteId) : false;
};
