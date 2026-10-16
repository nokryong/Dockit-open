import { Extension } from "@tiptap/core";
import { getForwardDeleteTarget } from "./utils/deleteBehaviorUtils";

const DeleteBehaviorGuard = Extension.create({
  name: "deleteBehaviorGuard",
  priority: 300,

  addOptions() {
    return {
      onDeleteBlockRequest: null
    };
  },

  addKeyboardShortcuts() {
    return {
      Delete: ({ editor }) => {
        const { state, view } = editor;

        if (view.composing) {
          return false;
        }

        const { selection } = state;

        if (!selection.empty || selection.node) {
          return false;
        }

        const target = getForwardDeleteTarget(state);

        if (!target) {
          return false;
        }

        if (target.kind === "noop") {
          return true;
        }

        if (typeof this.options.onDeleteBlockRequest === "function") {
          this.options.onDeleteBlockRequest(target);
        }

        return true;
      }
    };
  }
});

export default DeleteBehaviorGuard;
