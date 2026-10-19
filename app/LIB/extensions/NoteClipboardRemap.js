import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  createNoteClipboardProvenance,
  executeNoteClipboardPaste,
  preflightRawNoteClipboardHtml
} from "../utils/noteClipboardRemapUtils";

export const noteClipboardRemapKey = new PluginKey("noteClipboardRemap");

export const createNoteClipboardRemapPlugin = ({ onDiagnostic = null } = {}) => {
  const provenance = createNoteClipboardProvenance();
  const report = (result) => {
    if (!result.ok && typeof onDiagnostic === "function") {
      onDiagnostic(result.error);
    }
  };

  return new Plugin({
    key: noteClipboardRemapKey,
    props: {
      handleDOMEvents: {
        copy: (_view, event) => {
          provenance.begin(event.type);
          return false;
        },
        cut: (view, event) => {
          provenance.begin(event.type);
          queueMicrotask(() => provenance.confirmCut(view));
          return false;
        }
      },
      transformCopied(slice, view) {
        provenance.record(slice, view);
        return slice;
      },
      handlePaste(view, event, slice) {
        const rawHtml = event?.clipboardData?.getData?.("text/html") || "";
        const rawPreflight = preflightRawNoteClipboardHtml({ html: rawHtml, slice });
        if (!rawPreflight.ok) {
          report(rawPreflight);
          return true;
        }
        const result = executeNoteClipboardPaste(view, slice, provenance);
        if (result.result === "passthrough") return false;
        report(result);
        return true;
      }
    }
  });
};

export const installNoteClipboardRemap = (editor, options = {}) => {
  editor.registerPlugin(
    createNoteClipboardRemapPlugin(options),
    (plugin, plugins) => [plugin, ...plugins]
  );
  return () => {
    if (!editor.isDestroyed) editor.unregisterPlugin(noteClipboardRemapKey);
  };
};

const NoteClipboardRemap = Extension.create({
  name: "noteClipboardRemap",

  addOptions() {
    return { onDiagnostic: null };
  },

  addProseMirrorPlugins() {
    return [createNoteClipboardRemapPlugin({
      onDiagnostic: this.options.onDiagnostic
    })];
  }
});

export default NoteClipboardRemap;
