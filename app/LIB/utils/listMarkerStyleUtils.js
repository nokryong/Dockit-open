// Pagination widgets must not change an item's selector when page breaks move.
const getItemSelector = (item, editorElement) => {
  const path = [];
  for (let element = item; element && element !== editorElement; element = element.parentElement) {
    const tag = element.localName;
    const siblings = Array.from(element.parentElement.children).filter(
      sibling => sibling.localName === tag && !sibling.classList.contains("ProseMirror-widget")
    );
    path.unshift(`${tag}:nth-child(${siblings.indexOf(element) + 1} of ${tag}:not(.ProseMirror-widget))`);
  }
  return `.tiptap-container .tiptap-main-canvas > ${path.join(" > ")}`;
};

// Keep these rules outside the editable DOM: ProseMirror restores node attributes.
export function getListMarkerStyles(editorElement) {
  const document = editorElement.ownerDocument;
  const view = document.defaultView;
  const rules = [];

  editorElement.querySelectorAll("li:not(.tiptap-list-page-break-item)").forEach((item) => {
    if (!item.parentElement?.matches('ol, ul:not([data-type="taskList"])')) return;
    const paragraph = item.querySelector(":scope > p");
    if (!paragraph) return;

    // Read this item's first text, never text belonging to a nested list or a page spacer.
    const walker = document.createTreeWalker(paragraph, view.NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && (!text.textContent.trim() || text.parentElement.closest(".ProseMirror-widget"))) {
      text = walker.nextNode();
    }
    const style = view.getComputedStyle(text?.parentElement || paragraph);
    rules.push(`${getItemSelector(item, editorElement)}::before {
      font-family: ${style.fontFamily} !important;
      font-size: ${style.fontSize} !important;
      font-weight: ${style.fontWeight} !important;
      line-height: ${style.lineHeight} !important;
      color: ${style.color} !important;
    }`);
  });
  return rules.join("\n");
}
