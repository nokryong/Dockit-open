import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { TextSelection } from "@tiptap/pm/state";
import NoteBody from "../../../app/LIB/extensions/NoteBody";
import {
  focusNoteBody,
  getSelectionNoteBodyId,
  installNoteInteraction
} from "../../../app/LIB/extensions/NoteInteraction";
import NoteReference from "../../../app/LIB/extensions/NoteReference";
import { executeOrderedNoteOperation } from "../../../app/LIB/extensions/orderedNoteExecutor";
import {
  NOTE_OPERATION_TYPES
} from "../../../app/LIB/utils/noteOperationAdapter";
import "../../../app/LIB/css/tiptap.css";

const NOTE_ID = "note-v1-browser-u1";
const CustomDocument = Document.extend({
  content: "(paragraph | noteBody)+"
});
const editorHost = document.querySelector("#editor");
const status = document.querySelector("#fixture-status");

const editor = new Editor({
  element: editorHost,
  extensions: [
    CustomDocument,
    Paragraph,
    Text,
    UndoRedo,
    NoteReference,
    NoteBody
  ],
  content: {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "text", text: "Alpha" }]
    }]
  },
  editable: true,
  autofocus: false
});

const findNodePosition = (typeName, noteId = NOTE_ID) => {
  let position = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.type.name === typeName && node.attrs?.noteId === noteId) {
      position = nodePosition;
      return false;
    }
    return true;
  });
  return position;
};

const insertNote = (kind) => {
  const result = executeOrderedNoteOperation(editor, {
    type: NOTE_OPERATION_TYPES.INSERT,
    kind,
    position: editor.state.selection.from,
    bodyContent: [{ type: "paragraph" }]
  }, {
    idFactory: () => NOTE_ID
  });
  if (result.ok) focusNoteBody(editor, NOTE_ID);
  return result;
};

const uninstallInteraction = installNoteInteraction(editor, {
  executeOperation: (operation) =>
    executeOrderedNoteOperation(editor, operation),
  insertNote
});
let interactionDisposed = false;
let bodyScrollCount = 0;

const disposeInteraction = () => {
  if (interactionDisposed) return;
  interactionDisposed = true;
  uninstallInteraction();
};

const snapshot = () => {
  const referencePosition = findNodePosition("noteReference");
  const body = editor.getJSON().content.find(
    (node) => node.type === "noteBody" && node.attrs?.noteId === NOTE_ID
  );
  const referenceCount = editor.getJSON().content.reduce(
    (count, node) => count + (node.content || []).filter(
      (child) => child.type === "noteReference" && child.attrs?.noteId === NOTE_ID
    ).length,
    0
  );
  return {
    json: editor.getJSON(),
    editable: editor.isEditable,
    selection: editor.state.selection.toJSON(),
    selectionNoteId: getSelectionNoteBodyId(editor.state.selection),
    referencePosition,
    expectedReferenceReturnPosition:
      Number.isInteger(referencePosition) ? referencePosition + 1 : null,
    bodyKind: body?.attrs?.kind || null,
    bodyCount: body ? 1 : 0,
    referenceCount,
    bodyScrollCount,
    bodyText: body?.content?.map((node) =>
      node.content?.map((inline) => inline.text || "").join("") || ""
    ).join("\n") || ""
  };
};

window.__noteInteractionFixture = {
  NOTE_ID,
  disposeInteraction,
  editor,
  enterReadOnly(position = 3) {
    disposeInteraction();
    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, position)
    ));
    const bodyElement = editor.view.dom.querySelector(
      '[data-dockit-note-body="true"]'
    );
    if (bodyElement) {
      bodyElement.scrollIntoView = () => {
        bodyScrollCount += 1;
      };
    }
  },
  focusMain(position = 3) {
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, position)
    ));
    editor.view.focus();
  },
  snapshot
};

status.textContent = "ready";
document.body.dataset.fixtureStatus = "ready";
