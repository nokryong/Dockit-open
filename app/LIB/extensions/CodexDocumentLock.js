import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

// readOnly DOM alone does not block toolbar commands or object resize transactions.
export default Extension.create({
  name: 'codexDocumentLock',
  addOptions() { return { locked: false }; },
  addStorage() { return { locked: this.options.locked, applying: false }; },
  addProseMirrorPlugins() {
    return [new Plugin({ filterTransaction: transaction =>
      !transaction.docChanged || !this.storage.locked || this.storage.applying
    })];
  }
});
