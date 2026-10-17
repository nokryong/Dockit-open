/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { FontFamily, TextStyle } from '@tiptap/extension-text-style';
import { createLocalFontOptions, includeSelectedFont, quoteFontFamily, registerLocalFontFaces, unquoteFontFamily } from '../../app/LIB/utils/localFonts';

afterEach(() => {
  document.getElementById('dockit-local-font-faces')?.remove();
  vi.restoreAllMocks();
});

describe('local document fonts', () => {
  it('keeps registered names, distinct weights, and TTF/OTF variants', () => {
    const names = ['Gmarket Sans TTF Medium', 'Gmarket Sans OTF Medium', 'Pretendard Light', 'Pretendard Black'];
    const fonts = createLocalFontOptions(names.map((fullName, index) => ({ fullName, family: 'Family', postscriptName: `Face-${index}` })));
    expect(fonts.map(font => font.label)).toEqual(names);
    expect(fonts.map(font => font.value)).toEqual(names);
  });

  it('maps individual faces through local sources without shadowing native or provided families', () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: [{ family: 'Provided Face' }] });
    const fonts = createLocalFontOptions([
      { family: 'Arial', fullName: 'Arial', postscriptName: 'ArialMT' },
      { family: 'Arial', fullName: 'Arial Bold', postscriptName: 'Arial-BoldMT' },
      { family: 'Provided', fullName: 'Provided Face', postscriptName: 'Provided-Regular' },
    ]);
    registerLocalFontFaces(fonts);
    const style = document.getElementById('dockit-local-font-faces').textContent;
    expect(style).toContain('font-family:"Arial Bold"');
    expect(style).toContain('local("Arial-BoldMT")');
    expect(style).not.toContain('font-family:"Arial";');
    expect(style).not.toContain('font-family:"Provided Face"');
    expect(style).not.toContain('url(');
  });

  it('preserves missing font selection and recognizes CSS quoting without changing font data', () => {
    const options = [{ value: 'Arial Bold', label: 'Arial Bold' }];
    expect(includeSelectedFont(options, '"Arial Bold"')).toEqual([{ ...options[0], value: '"Arial Bold"' }]);
    expect(includeSelectedFont(options, '"Missing Font Light"').at(-1)).toEqual({
      value: '"Missing Font Light"', label: 'Missing Font Light', fontFamily: '"Missing Font Light"',
    });
    expect(options).toEqual([{ value: 'Arial Bold', label: 'Arial Bold' }]);
    expect(unquoteFontFamily('"Missing", "Arial"')).toBe('"Missing", "Arial"');
  });

  it('quotes special names without CSS or HTML injection', () => {
    const name = 'Font "One" \\ </style><script>';
    const quoted = quoteFontFamily(name);
    expect(quoted).not.toContain('<');
    expect(unquoteFontFamily(quoted)).toBe(name);
  });

  it('round-trips a selected local or missing font through editor HTML', () => {
    for (const name of ['Arial Bold', 'Missing Font Light']) {
      const options = { extensions: [Document, Paragraph, Text, TextStyle, FontFamily] };
      const editor = new Editor({ ...options, content: '<p>Font sample</p>' });
      editor.commands.selectAll();
      editor.commands.setFontFamily(quoteFontFamily(name));
      const reopened = new Editor({ ...options, content: editor.getHTML() });
      reopened.commands.selectAll();
      expect(unquoteFontFamily(reopened.getAttributes('textStyle').fontFamily)).toBe(name);
      expect(reopened.getText()).toBe('Font sample');
      reopened.destroy(); editor.destroy();
    }
  });
});
