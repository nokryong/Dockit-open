import { Extension } from "@tiptap/core";

export const FormatPainter = Extension.create({
  name: "formatPainter",

  addStorage() {
    return {
      marks: null
    };
  },

  addCommands() {
    return {
      copyFormat:
        () =>
        ({ editor }) => {
          const { state } = editor;
          const { selection } = state;

          const marks = selection.$from.marks();

          this.storage.marks = marks;

          return true;
        },
      pasteFormat:
        () =>
        ({ editor, tr }) => {
          // 복사된 서식이 없으면 아무것도 하지 않습니다.
          if (!this.storage.marks) {
            return false;
          }

          const { from, to } = editor.state.selection;

          if (from === to) {
            return false;
          }

          this.storage.marks.forEach((mark) => {
            tr.addMark(from, to, mark);
          });

          return true;
        }
    };
  }

  // 🗑️ onSelectionUpdate 부분을 완전히 제거합니다.
});
