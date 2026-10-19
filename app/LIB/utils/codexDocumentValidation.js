import { t as uiText } from "../i18n";
import { createNodeFromContent } from '@tiptap/core';
import { DOMParser } from '@tiptap/pm/model';
import { validateNoteSemantics } from './noteSemanticUtils';

export function validateCodexDocument(editor, record) {
  if (!editor?.schema || editor.isDestroyed) return { ok: false, message: uiText("문서 편집기가 준비되지 않았습니다.") };
  if (typeof record?.content !== 'string') return { ok: false, message: uiText("본문은 HTML 문자열이어야 합니다.") };
  try {
    const host = document.createElement('template');
    host.innerHTML = record.content;
    const rules = DOMParser.fromSchema(editor.schema).rules;
    for (const element of host.content.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM'].includes(element.tagName)) throw new Error(uiText("문서에 실행 코드나 웹페이지 요소를 넣을 수 없습니다."));
      for (const attribute of element.attributes) {
        if (/^on/i.test(attribute.name) || (['src', 'href'].includes(attribute.name) && /^(?:javascript|vbscript|file):/i.test(attribute.value.trim()))) throw new Error(uiText("허용하지 않는 HTML 속성입니다."));
      }
      const container = ['TBODY', 'THEAD', 'TFOOT'].includes(element.tagName)
        || (element.tagName === 'CODE' && element.parentElement?.tagName === 'PRE')
        || (element.closest('li[data-type="taskItem"]') && (['LABEL', 'DIV'].includes(element.tagName) || element.matches('input[type="checkbox"]')))
        || (element.matches('.caption-block-content, .caption-block-number') && element.closest('[data-caption-block="true"]'));
      if (!container && !rules.some(rule => rule.tag && element.matches(rule.tag))) throw new Error(uiText("허용하지 않는 HTML 요소입니다."));
    }
    // Tiptap's catch-all strict checker also catches valid non-consuming textStyle
    // spans. Match schema tags above and validate the actual parsed document here.
    const parsed = createNodeFromContent(record.content, editor.schema, { slice: false });
    parsed.check();
    const notes = validateNoteSemantics(parsed);
    if (!notes.valid) return { ok: false, message: uiText("각주·미주의 참조, 본문, ID 또는 종류가 올바르지 않습니다.") };
    return { ok: true };
  } catch (error) {
    // Never return HTML or parser exception causes to the model/UI.
    return { ok: false, message: error.message?.startsWith('문서에') || error.message?.startsWith('허용하지') ? error.message : uiText("편집기가 지원하지 않는 HTML 구조입니다. AGENTS.md의 태그와 속성을 확인해주세요.") };
  }
}
