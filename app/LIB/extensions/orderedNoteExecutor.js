import { executeNoteOperation } from "../utils/noteOperationAdapter";
import { normalizeNoteBodyOrderInTransaction } from "./noteBodyOrderUtils";

/** Keeps note mutations and reference-order normalization in one transaction. */
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
