/* @vitest-environment jsdom */
import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { Editor, createNodeFromContent } from '@tiptap/core';
import { editorExtensions } from '../../app/LIB/constant/editorExtensions';
import CodexDocumentLock from '../../app/LIB/extensions/CodexDocumentLock';
import { validateCodexDocument } from '../../app/LIB/utils/codexDocumentValidation';
import { restoreValidatedNotePersistenceHtml } from '../../app/LIB/utils/notePersistenceGate';

vi.mock('../../app/LIB/extensions/DiagramBlockView', () => ({ default: () => null }));
vi.mock('../../app/LIB/extensions/ShapeBlockView', () => ({ default: () => null }));
vi.mock('../../app/LIB/extensions/ChartBlockView', () => ({ default: () => null }));
vi.mock('../../app/LIB/extensions/LazyImageView', () => ({ default: () => null }));
const editors = [];
function create(content = '<p>본문</p>') {
  const editor = new Editor({ element: document.createElement('div'), extensions: [...editorExtensions, CodexDocumentLock], content });
  editors.push(editor); return editor;
}
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); });

it('all documented HTML examples load through the real document schema', () => {
  const guidance = fs.readFileSync('docs/codex/AGENTS.md', 'utf8');
  const editor = create();
  const examples = [...guidance.matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
  expect(examples.length).toBeGreaterThanOrEqual(7);
  for (const content of examples) {
    const node = createNodeFromContent(content, editor.schema, { slice: false });
    node.check();
    expect(validateCodexDocument(editor, { content }), content).toEqual({ ok: true });
  }
});

it('Pretendard variants and inline bold/sup/sub are editable with the same toolbar marks', () => {
  for (const weight of ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black']) {
    const editor = create(`<p><span style="font-family: Pretendard${weight}; font-size: 14pt; color: #123456"><strong>강조</strong><sup>2</sup><sub>3</sub></span></p>`);
    editor.commands.setTextSelection(2);
    expect(editor.getAttributes('textStyle')).toMatchObject({ fontFamily: `Pretendard${weight}`, fontSize: '14pt' });
    expect(editor.isActive('bold')).toBe(true);
    editor.commands.setTextSelection({ from: 1, to: 3 });
    editor.commands.unsetBold();
    expect(editor.isActive('bold')).toBe(false);
    expect(editor.getAttributes('textStyle').fontFamily).toBe(`Pretendard${weight}`);
    const texts = []; editor.state.doc.descendants(node => { if (node.isText) texts.push(node); });
    expect(texts.find(node => node.text === '2').marks.some(mark => mark.type.name === 'superscript')).toBe(true);
    expect(texts.find(node => node.text === '3').marks.some(mark => mark.type.name === 'subscript')).toBe(true);
  }
});

it('editing lock blocks toolbar/object transactions but permits validated external reload', () => {
  const editor = create('<p>사용자 원문</p>');
  const before = editor.getJSON();
  editor.storage.codexDocumentLock.locked = true;
  editor.setEditable(false, false);
  editor.commands.insertContent('금지');
  editor.commands.selectAll(); editor.commands.toggleBold();
  expect(editor.getJSON()).toEqual(before);
  editor.storage.codexDocumentLock.applying = true;
  expect(restoreValidatedNotePersistenceHtml(editor, '<p><sup>새 내용</sup></p>').ok).toBe(true);
  editor.storage.codexDocumentLock.applying = false;
  expect(editor.getText()).toBe('새 내용');
  editor.storage.codexDocumentLock.locked = false;
  editor.setEditable(true, false);
  editor.commands.insertContent('추가');
  expect(editor.getText()).toContain('추가');
});

it('invalid notes and executable/unsupported HTML cannot replace the valid document', () => {
  const editor = create();
  for (const content of ['<script>alert(1)</script>', '<p onclick="evil()">본문</p>', '<img src="file:///private">', '<custom-widget>내용</custom-widget>', '<p><span data-dockit-note-reference="true" data-dockit-note-id="note-v1-missing" data-dockit-note-kind="footnote"></span></p>']) {
    expect(validateCodexDocument(editor, { content }).ok, content).toBe(false);
  }
  expect(editor.getText()).toBe('본문');
});
