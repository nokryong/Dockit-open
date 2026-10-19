import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Paragraph from "@tiptap/extension-paragraph";

const SYNC_META_KEY = "paragraphFontSync";

/**
 * paragraph 내 자식 span들 중 가장 큰 fontSize(pt)를 반환.
 *
 * - 모든 text node에 명시적 fontSize가 있으면 → max 반환
 * - plain text(fontSize 없는 text node)가 하나라도 있으면 → null 반환
 *   (p에 font-size를 지정하면 plain text가 상속받아 크기가 바뀌는 문제 방지)
 */
function getMaxFontSize(paragraphNode) {
  let max = 0;
  let hasPlainText = false;

  paragraphNode.descendants((child) => {
    if (!child.isText) return;

    const fontSizeMark = child.marks?.find(
      (m) => m.type.name === "textStyle" && m.attrs?.fontSize
    );

    if (fontSizeMark) {
      const size = parseFloat(fontSizeMark.attrs.fontSize);
      if (!isNaN(size) && size > max) max = size;
    } else {
      hasPlainText = true;
    }
  });

  // plain text가 섞여 있으면 p에 font-size 지정 안함 → CSS 기본값 상속
  if (hasPlainText) return null;
  return max || null;
}

/**
 * fontSize 어트리뷰트를 지원하는 커스텀 Paragraph.
 * appendTransaction에 의해 자동으로 max span fontSize로 동기화됨.
 */
export const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => {
          const fs = element.style.fontSize;
          return fs ? parseFloat(fs) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}pt` };
        }
      }
    };
  }
});

/**
 * 문서가 변경될 때마다 각 paragraph의 fontSize 어트리뷰트를
 * 내부 span들의 최대 fontSize로 동기화하는 extension.
 *
 * - span 없음 → fontSize: null → CSS 기본값(12pt) 상속
 * - span 있음 → fontSize: max(span fontSizes) → p의 line-height가 span과 일치
 */
export const ParagraphFontSync = Extension.create({
  name: "paragraphFontSync",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("paragraphFontSync"),
        appendTransaction(transactions, _oldState, newState) {
          // 자기 자신이 만든 트랜잭션만 들어온 경우 스킵 (무한루프 방지)
          if (transactions.every((tr) => tr.getMeta(SYNC_META_KEY)))
            return null;
          if (!transactions.some((tr) => tr.docChanged)) return null;
          // storedMarks가 있으면 skip → 다음 트랜잭션에서 sync됨
          if (newState.storedMarks?.length) return null;

          const tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph") return;

            const maxSize = getMaxFontSize(node);
            const current = node.attrs.fontSize ?? null;

            if (maxSize !== current) {
              tr.setNodeMarkup(pos, null, { ...node.attrs, fontSize: maxSize });
              modified = true;
            }
          });

          if (modified) {
            tr.setMeta(SYNC_META_KEY, true);
            return tr;
          }
          return null;
        }
      })
    ];
  }
});
