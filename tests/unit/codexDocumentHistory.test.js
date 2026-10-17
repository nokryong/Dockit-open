// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { closeHistory } from '@tiptap/pm/history';
import DocumentHistory, { commitCodexHistory } from '../../app/LIB/extensions/DocumentHistory';
import CodexDocumentLock from '../../app/LIB/extensions/CodexDocumentLock';

let editor;
afterEach(() => editor?.destroy());
describe('Codex editing as a single native undo event', () => {
  it('keeps undo and redo when page settings recreate the editor', () => {
    const historyRef = { current: {} };
    const make = content => {
      const instance = new Editor({ extensions: [Document, Paragraph, Text, DocumentHistory.configure({ historyRef }), CodexDocumentLock], content });
      historyRef.current.restoring = false;
      return instance;
    };
    editor = make('<p>Before</p>');
    const before = { doc: editor.state.doc, anchor: 1, metadata: { title: 'Before' } };
    editor.storage.codexDocumentLock.locked = true;
    editor.storage.codexDocumentLock.applying = true;
    editor.commands.setContent('<p>After</p>');
    commitCodexHistory(editor, before, editor.state.doc, { title: 'After' });
    const html = editor.getHTML(); editor.destroy(); editor = make(html);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Before</p>');
    const undone = editor.getHTML(); editor.destroy(); editor = make(undone);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getHTML()).toBe('<p>After</p>');
  });
  it('undoes all previews and metadata together, redoes them, and preserves earlier user undo', () => {
    editor = new Editor({ extensions: [Document, Paragraph, Text, DocumentHistory, CodexDocumentLock], content: '<p>Before</p>' });
    let metadata = { title: 'Before', docSetting: { paddingTop: 25 } };
    editor.storage.codexDocumentLock.restoreMetadata = next => { metadata = next; };
    editor.commands.insertContent('User ');
    const previous = editor.getHTML();
    editor.view.dispatch(closeHistory(editor.state.tr));
    const before = { doc: editor.state.doc, anchor: editor.state.selection.anchor, metadata };
    editor.storage.codexDocumentLock.locked = true;
    editor.storage.codexDocumentLock.applying = true;
    editor.commands.setContent('<p>Intermediate</p>');
    editor.commands.setContent('<p>Completed</p>');
    const after = editor.state.doc;
    commitCodexHistory(editor, before, after, { title: 'After', docSetting: { paddingTop: 30 } });
    expect(editor.getHTML()).toBe('<p>Completed</p>');
    expect(metadata.title).toBe('After');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe(previous);
    expect(metadata.docSetting.paddingTop).toBe(25);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Completed</p>');
    expect(metadata.title).toBe('After');
    editor.commands.undo(); editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>Before</p>');
    editor.commands.redo(); editor.commands.redo();
    expect(editor.getHTML()).toBe('<p>Completed</p>');
  });
  it('records metadata-only edits but does not add history for a no-op turn', () => {
    editor = new Editor({ extensions: [Document, Paragraph, Text, DocumentHistory, CodexDocumentLock], content: '<p>Same</p>' });
    let metadata = { title: 'Before' };
    editor.storage.codexDocumentLock.restoreMetadata = next => { metadata = next; };
    const before = { doc: editor.state.doc, anchor: 1, metadata };
    editor.storage.codexDocumentLock.locked = true;
    commitCodexHistory(editor, before, before.doc, metadata);
    expect(editor.commands.undo()).toBe(false);
    editor.storage.codexDocumentLock.locked = true;
    commitCodexHistory(editor, before, before.doc, { title: 'After' });
    editor.commands.undo(); expect(metadata.title).toBe('Before');
    editor.commands.redo(); expect(metadata.title).toBe('After');
  });
});
