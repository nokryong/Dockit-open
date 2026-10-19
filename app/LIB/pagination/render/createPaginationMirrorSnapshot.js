const TRANSIENT_CLASS_NAMES = [
  "ProseMirror-focused",
  "ProseMirror-selectednode",
  "selectedCell"
];

const TRANSIENT_ATTRIBUTES = [
  "contenteditable",
  "spellcheck",
  "autocorrect",
  "autocapitalize",
  "translate",
  "tabindex"
];

const stripTransientEditorState = (rootElement) => {
  if (!(rootElement instanceof HTMLElement)) {
    return;
  }

  TRANSIENT_CLASS_NAMES.forEach((className) => {
    rootElement.classList.remove(className);
    rootElement.querySelectorAll(`.${className}`).forEach((element) => {
      element.classList.remove(className);
    });
  });

  [rootElement, ...rootElement.querySelectorAll("*")].forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    TRANSIENT_ATTRIBUTES.forEach((attributeName) => {
      element.removeAttribute(attributeName);
    });
  });
};

export const createPaginationMirrorSnapshot = (rootElement) => {
  if (!(rootElement instanceof HTMLElement)) {
    return null;
  }

  const clonedRoot = rootElement.cloneNode(true);

  if (!(clonedRoot instanceof HTMLElement)) {
    return null;
  }

  stripTransientEditorState(clonedRoot);
  clonedRoot.setAttribute("aria-hidden", "true");
  clonedRoot.setAttribute("data-pagination-mirror-root", "true");

  const outerHtml = clonedRoot.outerHTML;

  return {
    outerHtml,
    htmlLength: outerHtml.length
  };
};
