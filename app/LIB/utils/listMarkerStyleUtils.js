// 페이지 나눔이 움직여도 페이지 위젯이 항목 선택자를 바꾸면 안 됨
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

// 규칙은 편집 가능한 DOM 밖에 둠 (ProseMirror가 노드 속성을 복원함)
export function getListMarkerStyles(editorElement) {
  const document = editorElement.ownerDocument;
  const view = document.defaultView;
  const rules = [];

  editorElement.querySelectorAll("li:not(.tiptap-list-page-break-item)").forEach((item) => {
    if (!item.parentElement?.matches('ol, ul:not([data-type="taskList"])')) return;
    const paragraph = item.querySelector(":scope > p");
    if (!paragraph) return;

    // 이 항목의 첫 텍스트만 읽음 (중첩 목록이나 페이지 간격 요소의 텍스트 제외)
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
