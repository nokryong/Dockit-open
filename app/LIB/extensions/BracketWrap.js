import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * BracketWrap Extension
 *
 * 텍스트를 선택한 상태에서 괄호, 따옴표 등을 입력하면
 * 선택된 텍스트를 감싸는 기능 (VSCode와 동일한 동작)
 */
const BracketWrap = Extension.create({
  name: "bracketWrap",

  addProseMirrorPlugins() {
    const wrapPairs = {
      "(": ")",
      "[": "]",
      "{": "}",
      '"': '"',
      "'": "'",
      "`": "`"
    };

    return [
      new Plugin({
        key: new PluginKey("bracketWrap"),
        props: {
          handleKeyDown(view, event) {
            if (event.altKey) return false;

            const { state } = view;
            const { selection } = state;

            // 텍스트가 선택된 경우에만 동작
            if (selection.empty) return false;

            const openChar = event.key;
            const closeChar = wrapPairs[openChar];

            if (!closeChar) return false;

            // IME 입력 중이면 무시
            if (event.isComposing) return false;

            event.preventDefault();

            const { from, to } = selection;

            // 선택 영역의 마크를 보존하기 위해 앞뒤에 괄호만 삽입
            const tr = state.tr;
            tr.insertText(closeChar, to);
            tr.insertText(openChar, from);

            // 감싼 텍스트 내부를 선택 상태로 유지
            tr.setSelection(
              state.selection.constructor.create(tr.doc, from + 1, to + 1)
            );

            view.dispatch(tr);
            return true;
          }
        }
      })
    ];
  },

  addCommands() {
    return {
      wrapWithBracket:
        (open, close) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          if (from === to) return false;
          if (dispatch) {
            tr.insertText(close, to);
            tr.insertText(open, from);
            tr.setSelection(
              state.selection.constructor.create(tr.doc, from + 1, to + 1)
            );
          }
          return true;
        }
    };
  }
});

export default BracketWrap;
