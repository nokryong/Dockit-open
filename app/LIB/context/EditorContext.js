"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { NOTE_OPERATION_TYPES } from "../utils/noteOperationAdapter";
import { isSelectionInsideNoteBody } from "../utils/noteSelectionUtils";

const EditorContext = createContext(null);

export const DOCUMENT_OPERATION_ROLLBACK_HOST_UNAVAILABLE =
  "DOCUMENT_OPERATION_ROLLBACK_HOST_UNAVAILABLE";
const DOCUMENT_OPERATION_ROLLBACK_UNAVAILABLE_INSPECTION = Object.freeze({
  entries: Object.freeze([]),
  status: "unavailable"
});

const focusNoteBody = (editor, noteId) => {
  let bodyPosition = null;
  editor.state.doc.descendants((node, position) => {
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

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const convertPlainTextToHtml = (text) => {
  const normalizedText = `${text ?? ""}`.replace(/\r\n?/g, "\n").trim();

  if (!normalizedText) {
    return "";
  }

  return normalizedText
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export function EditorProvider({ children }) {
  const [editor, setEditor] = useState(null);
  const editorMounted = Boolean(editor && !editor.isDestroyed);

  const [saveAction, setSaveAction] = useState(null);
  const [printAction, setPrintAction] = useState(null);
  const [hwpxExportAction, setHwpxExportAction] = useState(null);
  const [docxExportAction, setDocxExportAction] = useState(null);
  const [hwpxImportAction, setHwpxImportAction] = useState(null);
  const [docxImportAction, setDocxImportAction] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);
  const [documentOperationRollbackRevision, setDocumentOperationRollbackRevision] = useState(0);

  const [onAddTextBox, setOnAddTextBox] = useState(null);
  const [onAddShape, setOnAddShape] = useState(null);
  const [onAddImage, setOnAddImage] = useState(null);
  const [onAddTable, setOnAddTable] = useState(null);
  const [onAddCodeBlock, setOnAddCodeBlock] = useState(null);
  const lastTextSelectionRef = useRef(null);
  const trackedNoteExecutorRef = useRef(null);
  const documentOperationRollbackAdapterRef = useRef(null);

  useEffect(() => {
    lastTextSelectionRef.current = null;
  }, [editor]);

  const registerTrackedNoteExecutor = useCallback((executor) => {
    if (typeof executor !== "function") return () => {};
    const registration = { executor };
    trackedNoteExecutorRef.current = registration;
    return () => {
      if (trackedNoteExecutorRef.current === registration) {
        trackedNoteExecutorRef.current = null;
      }
    };
  }, []);

  const notifyDocumentOperationRollbackChanged = useCallback(() => {
    setDocumentOperationRollbackRevision((revision) => revision + 1);
  }, []);

  const registerDocumentOperationRollbackAdapter = useCallback((adapter) => {
    if (!adapter || typeof adapter.inspect !== "function" ||
      typeof adapter.rollback !== "function") return () => {};
    const registration = { adapter };
    documentOperationRollbackAdapterRef.current = registration;
    notifyDocumentOperationRollbackChanged();
    return () => {
      if (documentOperationRollbackAdapterRef.current === registration) {
        documentOperationRollbackAdapterRef.current = null;
        notifyDocumentOperationRollbackChanged();
      }
    };
  }, [notifyDocumentOperationRollbackChanged]);

  const documentOperationRollback = useMemo(() => Object.freeze({
    isAvailable: () => Boolean(documentOperationRollbackAdapterRef.current?.adapter),
    inspect: () => documentOperationRollbackAdapterRef.current?.adapter.inspect() ||
      DOCUMENT_OPERATION_ROLLBACK_UNAVAILABLE_INSPECTION,
    rollback: (input) => documentOperationRollbackAdapterRef.current?.adapter.rollback(input) || {
      error: DOCUMENT_OPERATION_ROLLBACK_HOST_UNAVAILABLE,
      ok: false,
      result: "rejected"
    }
  }), []);

  const rememberTextSelection = useCallback((selection) => {
    if (!selection || selection.node || !selection.$from?.parent?.isTextblock) {
      lastTextSelectionRef.current = null;
      return;
    }

    lastTextSelectionRef.current = {
      from: selection.from,
      to: selection.to
    };
  }, []);

  const mapRememberedTextSelection = useCallback((transaction) => {
    const previous = lastTextSelectionRef.current;
    if (!previous || !transaction?.mapping || !transaction?.doc) return;
    const docSize = transaction.doc.content.size;
    const from = Math.max(
      0,
      Math.min(transaction.mapping.map(previous.from, -1), docSize)
    );
    const to = Math.max(
      from,
      Math.min(transaction.mapping.map(previous.to, 1), docSize)
    );
    lastTextSelectionRef.current = { from, to };
  }, []);

  const insertTextAtCursor = useCallback(
    (text) => {
      if (!editor) return false;

      const html = convertPlainTextToHtml(text);

      if (!html) return false;

      const fallbackSelection = editor.state.selection;
      const targetSelection = lastTextSelectionRef.current || fallbackSelection;

      if (!targetSelection || targetSelection.node) {
        return false;
      }

      const docSize = editor.state.doc.content.size;
      const from = Math.max(
        0,
        Math.min(targetSelection.from ?? fallbackSelection.from, docSize)
      );
      const to = Math.max(
        from,
        Math.min(targetSelection.to ?? fallbackSelection.to, docSize)
      );

      const inserted = editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .insertContent(html)
        .run();

      if (inserted) {
        rememberTextSelection(editor.state.selection);
      }

      return inserted;
    },
    [editor, rememberTextSelection]
  );

  const insertNoteAtRememberedSelection = useCallback((kind) => {
    if (!editor || editor.isDestroyed || !editor.isEditable) {
      return { ok: false, result: "rejected", error: { code: "NOTE_EDITOR_READ_ONLY" } };
    }

    const selection = lastTextSelectionRef.current || editor.state.selection;
    if (isSelectionInsideNoteBody(selection, editor.state.doc)) {
      return {
        ok: false,
        result: "rejected",
        error: { code: "NOTE_NESTED_INSERT_BLOCKED" }
      };
    }
    const noteIdsBefore = new Set();
    editor.state.doc.descendants((node) => {
      if (node.type.name === "noteReference") noteIdsBefore.add(node.attrs.noteId);
      return true;
    });
    const executeTrackedOperation = trackedNoteExecutorRef.current?.executor;
    if (!executeTrackedOperation) {
      return { ok: false, result: "rejected", error: { code: "NOTE_TRACKED_EXECUTOR_UNAVAILABLE" } };
    }
    const result = executeTrackedOperation({
      type: NOTE_OPERATION_TYPES.INSERT,
      kind,
      position: selection?.to ?? selection?.from,
      bodyContent: [{ type: "paragraph" }]
    });
    if (result.ok) {
      let insertedNoteId = null;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "noteReference" && !noteIdsBefore.has(node.attrs.noteId)) {
          insertedNoteId = node.attrs.noteId;
          return false;
        }
        return true;
      });
      if (insertedNoteId) {
        if (focusNoteBody(editor, insertedNoteId)) {
          lastTextSelectionRef.current = {
            from: editor.state.selection.from,
            to: editor.state.selection.to
          };
        }
      }
    }
    return result;
  }, [editor]);

  const value = useMemo(
    () => ({
      editor,
      setEditor,
      editorMounted,
      saveAction,
      setSaveAction,
      printAction,
      setPrintAction,
      hwpxExportAction,
      setHwpxExportAction,
      docxExportAction,
      setDocxExportAction,
      hwpxImportAction,
      setHwpxImportAction,
      docxImportAction,
      setDocxImportAction,
      selectedObject,
      setSelectedObject,
      onAddTextBox,
      setOnAddTextBox,
      onAddShape,
      setOnAddShape,
      onAddImage,
      setOnAddImage,
      onAddTable,
      setOnAddTable,
      onAddCodeBlock,
      setOnAddCodeBlock,
      rememberTextSelection,
      mapRememberedTextSelection,
      insertTextAtCursor,
      registerTrackedNoteExecutor,
      registerDocumentOperationRollbackAdapter,
      documentOperationRollback,
      documentOperationRollbackRevision,
      notifyDocumentOperationRollbackChanged,
      insertNoteAtRememberedSelection
    }),
    [
      editor,
      editorMounted,
      saveAction,
      printAction,
      hwpxExportAction,
      docxExportAction,
      hwpxImportAction,
      docxImportAction,
      selectedObject,
      onAddTextBox,
      onAddShape,
      onAddImage,
      onAddTable,
      onAddCodeBlock,
      rememberTextSelection,
      mapRememberedTextSelection,
      insertTextAtCursor,
      registerTrackedNoteExecutor,
      registerDocumentOperationRollbackAdapter,
      documentOperationRollback,
      documentOperationRollbackRevision,
      notifyDocumentOperationRollbackChanged,
      insertNoteAtRememberedSelection
    ]
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within a EditorProvider");
  }
  return context;
}
