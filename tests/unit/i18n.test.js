/* @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { getDateLocale, getLanguage, setLanguage, t, translateMessage, useI18n } from '../../app/LIB/i18n';
import { WIDGET_DRAWER_GROUPS } from '../../app/LIB/constant/widgetGroups';
import { fontOptions } from '../../app/LIB/constant/fontOptions';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import NoteBody from '../../app/LIB/extensions/NoteBody';
import NoteReference from '../../app/LIB/extensions/NoteReference';

vi.mock('sud-ui', () => ({ Typography: ({ children }) => React.createElement('span', null, children) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(() => {
  if (root) act(() => root.unmount());
  root = null;
  setLanguage('ko');
  document.body.innerHTML = '';
});

it('updates subscribed screens without replacing editable content', () => {
  function Screen() {
    useI18n();
    return React.createElement('section', null,
      React.createElement('label', null, t('설정')),
      React.createElement('textarea', { defaultValue: '한국어 문서 and English' }));
  }
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(Screen)));
  const textarea = container.querySelector('textarea');
  textarea.value = '사용자가 수정한 내용';
  act(() => setLanguage('en'));
  expect(container.querySelector('label').textContent).toBe('Settings');
  expect(container.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('사용자가 수정한 내용');
  expect(document.documentElement.lang).toBe('en');
  expect(getDateLocale()).toBe('en-US');
  act(() => setLanguage('ko'));
  expect(container.querySelector('label').textContent).toBe('설정');
});

it('translates metadata when read after a language change without changing IDs or font values', () => {
  const group = WIDGET_DRAWER_GROUPS.find(item => item.id === 'writing');
  const font = fontOptions[0];
  const fontValue = font.value;
  expect(group.title).toBe('문서 작성');
  setLanguage('en');
  expect(group.title).toBe('Writing');
  expect(group.items[0].id).toBe('specialChar');
  expect(font.label).toContain('Pretendard');
  expect(font.content.props.children[0]).toBe(font.label);
  expect(font.value).toBe(fontValue);
});

it('translates known diagnostics and preserves filenames, unknown messages, and literal braces', () => {
  setLanguage('en');
  expect(translateMessage("'원본 [1].docx'을 불러왔습니다.")).toBe("Imported '원본 [1].docx'.");
  expect(translateMessage('손상된 JSON 파일입니다: 파일(1).json')).toBe('Corrupted JSON file: 파일(1).json');
  expect(translateMessage('Original provider message {text}')).toBe('Original provider message {text}');
  expect(translateMessage(undefined)).toBeUndefined();
  expect(t('문서 변환 단계 · {0}번째 경고', 3)).toBe('Document conversion · Warning 3');
  setLanguage('fr');
  expect(getLanguage()).toBe('ko');
  expect(translateMessage("Imported '원본 [1].docx'.")).toBe("'원본 [1].docx'을 불러왔습니다.");
  expect(translateMessage('The ChatGPT connection expired. Please reconnect.')).toBe('ChatGPT 연결이 만료되었습니다. 다시 연결해주세요.');
});

it('refreshes note labels without changing note content or document structure', async () => {
  const element = document.body.appendChild(document.createElement('div'));
  const editor = new Editor({
    element,
    extensions: [Document.extend({ content: '(paragraph | noteBody)+' }), Paragraph, Text, NoteReference, NoteBody],
    content: {
      type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: '본문' }, { type: 'noteReference', attrs: { noteId: 'note-v1-en-test', kind: 'endnote' } }] },
        { type: 'noteBody', attrs: { noteId: 'note-v1-en-test', kind: 'endnote' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '미주 내용 유지' }] }] }
      ]
    }
  });
  try {
    const before = editor.getJSON();
    expect(element.querySelector('.dockit-endnote-section-title').textContent).toBe('미주');
    setLanguage('en');
    editor.view.dispatch(editor.state.tr.setMeta('uiLanguage', 'en').setMeta('addToHistory', false));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(element.querySelector('.dockit-endnote-section-title').textContent).toBe('Endnote');
    expect(element.querySelector('.dockit-note-reference').getAttribute('aria-label')).toBe('Go to Endnote 1 content');
    expect(editor.getJSON()).toEqual(before);
  } finally { editor.destroy(); }
});
