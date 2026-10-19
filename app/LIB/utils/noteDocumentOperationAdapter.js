import {
  DOCUMENT_OPERATION_SOURCES,
  DOCUMENT_OPERATION_TYPES,
  attachDocumentOperationTransactionMetadataToTransaction,
  captureEditorDocumentOperationSnapshot,
  createDocumentOperationExecutor,
  createDocumentOperationNonce,
  createDocumentRootOperation,
  getDocumentOperationId,
  getDocumentSemanticFingerprint,
  restoreEditorDocumentOperationSnapshot
} from "./documentOperationUtils";
import { executeNoteOperation } from "./noteOperationAdapter";

const NOTE_DOCUMENT_OPERATION_ERROR = "NOTE_DOCUMENT_OPERATION_REJECTED";

const rejected = (code = NOTE_DOCUMENT_OPERATION_ERROR) => ({
  ok: false,
  result: "rejected",
  error: { code }
});

const privacySafePayload = (operation) => ({
  action: operation?.type,
  kind:
    operation?.type === "insertNote" || operation?.type === "convertNoteKind"
      ? operation.kind ?? null
      : null
});

/**
 * N2b의 유일한 수동 주석 변경 연결
 * (주석 ID나 본문·문서 내용이 아닌 작업 모양만 저널에 남기고, N1b가 만든 단일 트랜잭션에 정보를 덧붙임)
 */
export const createNoteDocumentOperationAdapter = ({
  actor,
  editor,
  onDocumentOperationSettled,
  onDocumentOperationWillApply,
  nonceFactory = createDocumentOperationNonce,
  noteExecutor = executeNoteOperation,
  createExecutor = createDocumentOperationExecutor
} = {}) => {
  const executor = createExecutor({
    getDocument: () => editor?.view?.state?.doc ?? editor?.state?.doc,
    getRevision: (document) => getDocumentSemanticFingerprint(document),
    captureDocument: () => captureEditorDocumentOperationSnapshot(editor),
    restoreDocument: (snapshot) =>
      restoreEditorDocumentOperationSnapshot(editor, snapshot)
  });
  const execute = (noteOperation) => {
    if (
      !editor?.state?.doc ||
      editor.isDestroyed ||
      typeof actor !== "string" ||
      !actor ||
      typeof onDocumentOperationWillApply !== "function" ||
      typeof onDocumentOperationSettled !== "function"
    ) {
      return rejected();
    }

    const beforeDocument = editor.view?.state?.doc ?? editor.state.doc;
    const fingerprint = getDocumentSemanticFingerprint(beforeDocument);
    let nonce;
    try {
      nonce = nonceFactory();
    } catch {
      return rejected();
    }
    const operation = createDocumentRootOperation({
      actor,
      baseRevision: fingerprint,
      idempotencyKey: `manual-note-${noteOperation?.type || "unknown"}-${nonce}`,
      payload: privacySafePayload(noteOperation),
      source: DOCUMENT_OPERATION_SOURCES.MANUAL,
      targetFingerprint: fingerprint,
      type: DOCUMENT_OPERATION_TYPES.NOTE_MUTATION
    });
    const operationId = getDocumentOperationId(operation);

    try {
      if (onDocumentOperationWillApply({ operation, operationId }) !== true) {
        return rejected();
      }
    } catch {
      return rejected();
    }

    let noteResult = null;
    let executorResult;
    try {
      executorResult = executor.execute(operation, ({ operation: rootOperation, operationId: rootOperationId }) => {
        noteResult = noteExecutor(editor, noteOperation, {
          transactionDecorator: (transaction) =>
            attachDocumentOperationTransactionMetadataToTransaction(transaction, {
              operation: rootOperation,
              operationId: rootOperationId
            })
        });
        return noteResult?.ok === true;
      });
    } catch {
      return rejected();
    }

    try {
      onDocumentOperationSettled({ operation, result: executorResult });
    } catch {
      // 영구 결과 전달이 잠시 안 돼도 C3 결과가 기준
      // (복구는 페이지 단위 재시도가 담당)
    }
    return executorResult?.ok === true && noteResult?.ok === true
      ? noteResult
      : rejected();
  };

  return { execute };
};

export { NOTE_DOCUMENT_OPERATION_ERROR };
