import { t as uiText, translateMessage } from "../i18n";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { toast } from "sud-ui";
import {
  createNoteBodyOrderAppendTransaction,
  normalizeNoteBodyOrderInTransaction
} from "./noteBodyOrderUtils";
import {
  getSelectionNoteBodyId,
  isSelectionInsideNoteBody
} from "../utils/noteSelectionUtils";

export {
  getSelectionNoteBodyId,
  isSelectionInsideNoteBody
} from "../utils/noteSelectionUtils";

export const NOTE_INSERT_REQUEST_EVENT = "dockit-note-insert-request";
const HWP_NOTE_CHORD_TIMEOUT_MS = 1_500;

export const focusNoteBody = (editor, noteId) => {
  let bodyPosition = null;
  editor?.state?.doc.descendants((node, position) => {
    if (node.type.name !== "noteBody" || node.attrs?.noteId !== noteId) {
      return true;
    }
    bodyPosition = position;
    return false;
  });
  if (!Number.isInteger(bodyPosition)) return false;
  editor.chain()
    .focus()
    .setTextSelection(bodyPosition + 2)
    .scrollIntoView()
    .run();
  return true;
};

const findFirstMainTextPosition = (documentNode) => {
  let position = null;
  documentNode?.descendants((node, nodePosition) => {
    if (position !== null || node.type.name === "noteBody") return false;
    if (node.isTextblock) {
      position = nodePosition + 1;
      return false;
    }
    return true;
  });
  return position;
};

export const focusNoteReference = (editor, noteId) => {
  const view = editor?.view;
  if (!view) return false;
  let match = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "noteReference" || node.attrs?.noteId !== noteId) {
      return true;
    }
    match = { node, position };
    return false;
  });
  const position = match
    ? match.position + match.node.nodeSize
    : findFirstMainTextPosition(editor.state.doc);
  if (Number.isInteger(position)) {
    view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, position)
    ));
  }
  view.focus();
  match && [...view.dom.querySelectorAll('[data-dockit-note-reference="true"]')]
    .find((element) => element.getAttribute("data-dockit-note-id") === noteId)
    ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
};

export const noteInteractionPluginKey = new PluginKey(
  "dockitNoteInteraction"
);

const requestNoteInsertion = (editor, kind, onInsertRequest) => {
  const blocked = isSelectionInsideNoteBody(editor.state.selection);
  const detail = blocked
    ? {
        kind,
        error: {
          code: "NOTE_NESTED_INSERT_BLOCKED",
          message: uiText("각주·미주 본문 안에는 다른 각주나 미주를 넣을 수 없습니다.")
        }
      }
    : { kind };
  if (onInsertRequest) {
    onInsertRequest(detail);
    return true;
  }
  const EventConstructor = editor.view.dom.ownerDocument.defaultView.CustomEvent;
  editor.view.dom.dispatchEvent(new EventConstructor(
    NOTE_INSERT_REQUEST_EVENT,
    {
      bubbles: true,
      detail
    }
  ));
  return true;
};

const createPlaceholderDecorations = (documentNode) => {
  const decorations = [];
  documentNode.descendants((node, position) => {
    if (node.type.name !== "noteBody") return true;
    const paragraph = node.firstChild;
    if (paragraph?.type.name === "paragraph" && paragraph.content.size === 0) {
      const paragraphPosition = position + 1;
      decorations.push(Decoration.node(
        paragraphPosition,
        paragraphPosition + paragraph.nodeSize,
        {
          class: "dockit-note-body-placeholder",
          "data-placeholder": uiText("내용 입력")
        }
      ));
    }
    return false;
  });
  return DecorationSet.create(documentNode, decorations);
};

const collectPairState = (documentNode) => {
  const references = new Map();
  const bodies = new Map();
  let duplicate = false;
  documentNode.descendants((node) => {
    if (node.type.name === "noteReference") {
      if (references.has(node.attrs?.noteId)) duplicate = true;
      references.set(node.attrs?.noteId, node.attrs?.kind);
      return false;
    }
    if (node.type.name === "noteBody") {
      if (bodies.has(node.attrs?.noteId)) duplicate = true;
      bodies.set(node.attrs?.noteId, node.attrs?.kind);
      return false;
    }
    return true;
  });
  return { references, bodies, duplicate };
};

const isCompletePairState = ({ references, bodies, duplicate }) => {
  if (duplicate || references.size !== bodies.size) return false;
  return [...references].every(
    ([noteId, kind]) => bodies.get(noteId) === kind
  );
};

export const preservesCompleteNotePairs = (beforeDocument, afterDocument) => {
  const before = collectPairState(beforeDocument);
  if (!isCompletePairState(before)) return true;
  return isCompletePairState(collectPairState(afterDocument));
};

const adjacentReferenceId = (selection, key) => {
  if (!selection.empty) return null;
  const node = key === "Backspace"
    ? selection.$from.nodeBefore
    : selection.$from.nodeAfter;
  return node?.type?.name === "noteReference" ? node.attrs?.noteId || null : null;
};

const selectedReferenceIds = (documentNode, selection) => {
  if (selection.empty) return [];
  const ids = [];
  const seen = new Set();
  documentNode.nodesBetween(selection.from, selection.to, (node, position) => {
    if (node.type.name === "noteBody") return false;
    if (
      node.type.name === "noteReference" &&
      position < selection.to &&
      position + node.nodeSize > selection.from &&
      !seen.has(node.attrs?.noteId)
    ) {
      seen.add(node.attrs.noteId);
      ids.push(node.attrs.noteId);
      return false;
    }
    return true;
  });
  return ids;
};

const deleteSelectedNotes = (editor, event, executeOperation) => {
  if (
    !editor.isEditable ||
    (event.key !== "Backspace" && event.key !== "Delete")
  ) {
    return false;
  }
  const selection = editor.state.selection;
  const noteIds = selection.empty
    ? [adjacentReferenceId(selection, event.key)].filter(Boolean)
    : selectedReferenceIds(editor.state.doc, selection);
  if (noteIds.length === 0) return false;

  if (typeof executeOperation !== "function") return true;
  for (const noteId of noteIds) {
    const result = executeOperation({ type: "deleteNote", noteId });
    if (!result?.ok) return true;
  }

  if (!selection.empty && !editor.state.selection.empty) {
    editor.commands.deleteSelection();
  }
  return true;
};

const getNoteContextTarget = (eventTarget) => {
  if (!eventTarget?.closest) return null;
  const reference = eventTarget.closest('[data-dockit-note-reference="true"]');
  const body = eventTarget.closest('[data-dockit-note-body="true"]');
  const element = reference || body;
  if (!element) return null;
  return {
    kind: element.getAttribute("data-dockit-note-kind"),
    noteId: element.getAttribute("data-dockit-note-id"),
    source: reference ? "reference" : "body"
  };
};

const runContextMenuAction = (
  editor,
  executeOperation,
  target,
  action
) => {
  if (action === "navigate") {
    return target.source === "reference"
      ? focusNoteBody(editor, target.noteId)
      : focusNoteReference(editor, target.noteId);
  }
  if (typeof executeOperation !== "function") return false;
  if (action === "delete") {
    return executeOperation({
      type: "deleteNote",
      noteId: target.noteId
    })?.ok === true;
  }
  if (action === "convert") {
    return executeOperation({
      type: "convertNoteKind",
      noteId: target.noteId,
      kind: target.kind === "footnote" ? "endnote" : "footnote"
    })?.ok === true;
  }
  return false;
};

export const createNoteInteractionPlugin = (
  editor,
  onInsertRequest = null,
  executeOperation = null
) => {
  let disposeContextMenu = null;
  let contextMenuRequest = 0;
  let noteChordDeadline = 0;
  let destroyed = false;
  const appendTransaction = createNoteBodyOrderAppendTransaction();

  return new Plugin({
    key: noteInteractionPluginKey,
    filterTransaction: (transaction, state) =>
      preservesCompleteNotePairs(state.doc, transaction.doc),
    appendTransaction,
    props: {
      decorations: (state) => editor.isEditable
        ? createPlaceholderDecorations(state.doc)
        : DecorationSet.empty,
      handleDOMEvents: {
        contextmenu: (_view, event) => {
          if (!editor.isEditable) return false;
          const target = getNoteContextTarget(event.target);
          if (!target?.noteId || !target.kind) return false;
          event.preventDefault();
          event.stopPropagation();
          disposeContextMenu?.();
          const request = ++contextMenuRequest;
          import("../components/write/NoteContextMenu")
            .then(({ showNoteContextMenu }) => {
              if (destroyed || request !== contextMenuRequest) return;
              disposeContextMenu = showNoteContextMenu({
                kind: target.kind,
                onAction: (action) =>
                  runContextMenuAction(editor, executeOperation, target, action),
                source: target.source,
                x: event.clientX,
                y: event.clientY
              });
            })
            .catch((error) => {
              console.error("Note context menu load failed:", error);
            });
          return true;
        },
        dblclick: (_view, event) => {
          if (!editor.isEditable || !event.target?.closest) return false;
          const label = event.target.closest('[data-dockit-note-number="true"]');
          const body = label?.closest('[data-dockit-note-body="true"]');
          const noteId = body?.getAttribute("data-dockit-note-id");
          if (!noteId) return false;
          event.preventDefault();
          event.stopPropagation();
          return focusNoteReference(editor, noteId);
        }
      },
      handleKeyDown: (_view, event) => {
        if (deleteSelectedNotes(editor, event, executeOperation)) return true;
        const key = `${event.key ?? ""}`.toLowerCase();
        const now = Date.now();
        const isControlOnly =
          event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey;
        const isPlainKey =
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey;

        if (noteChordDeadline >= now) {
          noteChordDeadline = 0;
          if ((isPlainKey || isControlOnly) && (key === "n" || key === "e")) {
            return requestNoteInsertion(
              editor,
              key === "n" ? "footnote" : "endnote",
              onInsertRequest
            );
          }
        }

        if (isControlOnly && key === "n") {
          noteChordDeadline = now + HWP_NOTE_CHORD_TIMEOUT_MS;
          return true;
        }
        noteChordDeadline = 0;

        if (
          event.altKey &&
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey
        ) {
          if (key === "f" || key === "d") {
            return requestNoteInsertion(
              editor,
              key === "f" ? "footnote" : "endnote",
              onInsertRequest
            );
          }
        }
        if (event.key === "Escape") {
          const noteId = getSelectionNoteBodyId(editor.state.selection);
          return noteId ? focusNoteReference(editor, noteId) : false;
        }
        return event.key === "Tab" &&
          isSelectionInsideNoteBody(editor.state.selection);
      }
    },
    view: () => ({
      update: (_view, previousState) => {
        if (!previousState.doc.eq(editor.state.doc)) {
          contextMenuRequest += 1;
          disposeContextMenu?.();
          disposeContextMenu = null;
        }
      },
      destroy: () => {
        destroyed = true;
        noteChordDeadline = 0;
        contextMenuRequest += 1;
        disposeContextMenu?.();
        disposeContextMenu = null;
      }
    })
  });
};

const resolveInstallOptions = (options) =>
  typeof options === "function" ? { insertNote: options } : options || {};

export const installNoteInteraction = (editor, options) => {
  const { executeOperation, insertNote } = resolveInstallOptions(options);
  const previousStorage = editor.storage.noteInteraction;
  editor.storage.noteInteraction = { focusNoteBody, focusNoteReference };
  const handleInsertRequest = ({ kind, error }) => {
    if (error?.code === "NOTE_NESTED_INSERT_BLOCKED") {
      toast.info(translateMessage(error.message));
      return;
    }
    const result = insertNote?.(kind);
    if (result?.ok) return;
    toast.info(
      translateMessage(result?.error?.code === "NOTE_NESTED_INSERT_BLOCKED"
        ? uiText("각주·미주 본문 안에는 다른 각주나 미주를 넣을 수 없습니다.")
        : uiText("본문의 글자 위치에 커서를 놓고 다시 시도해 주세요."))
    );
  };
  editor.registerPlugin(
    createNoteInteractionPlugin(
      editor,
      handleInsertRequest,
      executeOperation
    ),
    (plugin, plugins) => [plugin, ...plugins]
  );

  const normalization = editor.state.tr;
  if (normalizeNoteBodyOrderInTransaction(normalization)) {
    normalization.setMeta("addToHistory", false);
    editor.view.dispatch(normalization);
  }

  return () => {
    if (!editor.isDestroyed) editor.unregisterPlugin(noteInteractionPluginKey);
    if (previousStorage) editor.storage.noteInteraction = previousStorage;
    else delete editor.storage.noteInteraction;
  };
};

const NoteInteraction = Extension.create({
  name: "noteInteraction",
  priority: 900,
  addStorage() {
    return { focusNoteBody, focusNoteReference };
  },
  addProseMirrorPlugins() {
    return [createNoteInteractionPlugin(this.editor)];
  }
});

export default NoteInteraction;
