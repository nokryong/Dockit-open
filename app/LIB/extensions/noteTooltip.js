import { t as uiText } from "../i18n";
let tooltipSequence = 0;

const getPlainTextPreview = (documentNode, noteId) => {
  let bodyText = "";
  documentNode?.descendants((node) => {
    if (node.type.name !== "noteBody" || node.attrs?.noteId !== noteId) {
      return true;
    }
    bodyText = node.textContent.replace(/\s+/g, " ").trim();
    return false;
  });
  if (!bodyText) return uiText("내용 없음");
  return bodyText.length > 200
    ? `${bodyText.slice(0, 199)}…`
    : bodyText;
};

export const scheduleNoteTooltip = ({
  dom,
  documentNode,
  noteId,
  kind,
  number,
  delay
}) => {
  let tooltip = null;
  const timer = setTimeout(() => {
    const ownerDocument = dom.ownerDocument;
    tooltip = ownerDocument.createElement("span");
    const label = ownerDocument.createElement("span");
    const preview = ownerDocument.createElement("span");
    tooltipSequence += 1;
    tooltip.id = `dockit-note-tooltip-${tooltipSequence}`;
    tooltip.className = "dockit-note-reference-tooltip";
    tooltip.setAttribute("role", "tooltip");
    label.className = "dockit-note-reference-tooltip__label";
    preview.className = "dockit-note-reference-tooltip__preview";
    label.textContent = `${kind === "endnote" ? uiText("미주") : uiText("각주")} ${number ?? uiText("번호 없음")}`;
    preview.textContent = getPlainTextPreview(documentNode, noteId);
    tooltip.append(label, preview);
    ownerDocument.body.appendChild(tooltip);
    const rect = dom.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, rect.left)}px`;
    tooltip.style.top = `${rect.bottom + 8}px`;
    dom.setAttribute("aria-describedby", tooltip.id);
  }, delay);
  return () => {
    clearTimeout(timer);
    tooltip?.remove();
    dom.removeAttribute("aria-describedby");
  };
};
