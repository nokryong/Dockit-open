import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

// readOnly DOM만으로는 툴바 명령이나 개체 크기 조절 트랜잭션이 막히지 않음
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
