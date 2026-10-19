import { executeNoteOperation } from "../utils/noteOperationAdapter";
import { normalizeNoteBodyOrderInTransaction } from "./noteBodyOrderUtils";

/** 주석 변경과 참조 순서 정규화를 한 트랜잭션으로 처리 */
export const executeOrderedNoteOperation = (editor, operation, options = {}) => {
  const transactionDecorator = options?.transactionDecorator;
  return executeNoteOperation(editor, operation, {
    ...options,
    transactionDecorator: (transaction) => {
      transactionDecorator?.(transaction);
      normalizeNoteBodyOrderInTransaction(transaction);
    }
  });
};
