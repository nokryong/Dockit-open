import { UndoRedo } from '@tiptap/extensions';
import { Step, StepResult, StepMap } from '@tiptap/pm/transform';
import { closeHistory } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';

// A metadata step participates in the same history event as the HTML replacement.
export class DocumentMetadataStep extends Step {
  constructor(before, after) { super(); this.before = before; this.after = after; }
  apply(doc) { return StepResult.ok(doc); }
  invert() { return new DocumentMetadataStep(this.after, this.before); }
  map() { return this; }
  getMap() { return StepMap.empty; }
  toJSON() { return { stepType: 'dockitDocumentMetadata', before: this.before, after: this.after }; }
  static fromJSON(_schema, json) { return new DocumentMetadataStep(json.before, json.after); }
}
// Vite can reload this module without restarting ProseMirror's step registry.
try { Step.jsonID('dockitDocumentMetadata', DocumentMetadataStep); } catch { /* already registered */ }

export const documentMetadata = value => Object.fromEntries(
  ['title', 'docSetting', 'bulletStyle', 'viewPage', 'pageNumber'].map(key => [key, value[key]])
);

const copyState = (value, fields) => Object.assign(Object.create(Object.getPrototypeOf(value)), value, fields);
function rebindHistory(history, schema) {
  // ProseMirror history keeps Steps containing schema-owned nodes. Rehydrate only
  // those Steps when Tiptap recreates its schema for changed page settings.
  const branch = value => copyState(value, {
    items: value.items.slice(0, 0).append(value.items.map(item => item.step
      ? copyState(item, { step: Step.fromJSON(schema, item.step.toJSON()) }) : item))
  });
  return copyState(history, { done: branch(history.done), undone: branch(history.undone) });
}

export function commitCodexHistory(editor, before, afterDoc, afterMetadata, sourceHtml) {
  const lock = editor.storage.codexDocumentLock;
  lock.applying = true;
  try {
    // Preview transactions leave history untouched. Return to its original coordinate
    // space before recording one ordinary, undoable transaction.
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, before.doc.content)
      .setMeta('dockitCodexPreview', true).setMeta('preventUpdate', true));
    lock.locked = false;
    if (!before.doc.eq(afterDoc) || JSON.stringify(before.metadata) !== JSON.stringify(afterMetadata)) {
      const tr = closeHistory(editor.state.tr);
      if (!before.doc.eq(afterDoc)) tr.replaceWith(0, tr.doc.content.size, afterDoc.content);
      tr.step(new DocumentMetadataStep(before.metadata, afterMetadata));
      if (sourceHtml !== undefined) tr.setMeta('dockitExternalContent', sourceHtml);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(before.anchor, tr.doc.content.size))));
      editor.view.dispatch(tr);
      editor.view.dispatch(closeHistory(editor.state.tr));
    }
  } finally { lock.locked = false; lock.applying = false; }
}

export default UndoRedo.extend({
  addOptions() { return { ...this.parent(), historyRef: null }; },
  addProseMirrorPlugins() {
    const plugins = this.parent();
    const ref = this.options.historyRef;
    if (ref) ref.current.restoring = true;
    for (const plugin of plugins) {
      const init = plugin.spec.state.init;
      plugin.spec.state.init = (config, state) => ref?.current.history ? rebindHistory(ref.current.history, state.schema) : init(config, state);
      const apply = plugin.spec.state.apply;
      plugin.spec.state.apply = (tr, value, oldState, newState) => {
        if (ref?.current.restoring || tr.getMeta('dockitCodexPreview') || this.editor.storage.codexDocumentLock?.locked) return value;
        const next = apply(tr, value, oldState, newState);
        if (ref) ref.current.history = next;
        return next;
      };
    }
    return plugins;
  },
  onTransaction({ transaction }) {
    for (const step of transaction.steps) {
      if (step.jsonID === 'dockitDocumentMetadata') this.editor.storage.codexDocumentLock?.restoreMetadata?.(step.after);
    }
  }
});
