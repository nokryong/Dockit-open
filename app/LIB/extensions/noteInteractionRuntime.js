import { createNoteDocumentOperationAdapter } from "../utils/noteDocumentOperationAdapter";
import { installNoteClipboardRemap } from "./NoteClipboardRemap";
import { installNoteInteraction } from "./NoteInteraction";
import { executeOrderedNoteOperation } from "./orderedNoteExecutor";

export const installNoteInteractionRuntime = ({
  actor,
  editor,
  insertNote,
  onDocumentOperationSettled,
  onDocumentOperationWillApply
}) => {
  const trackedNoteExecutor = createNoteDocumentOperationAdapter({
    actor,
    editor,
    noteExecutor: executeOrderedNoteOperation,
    onDocumentOperationSettled,
    onDocumentOperationWillApply
  });
  const disposeClipboard = installNoteClipboardRemap(editor);
  const disposeInteraction = installNoteInteraction(editor, {
    executeOperation: trackedNoteExecutor.execute,
    insertNote
  });

  return {
    dispose: () => {
      disposeInteraction();
      disposeClipboard();
    },
    trackedNoteExecutor
  };
};
