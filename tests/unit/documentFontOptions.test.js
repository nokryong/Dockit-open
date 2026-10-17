/* @vitest-environment jsdom */
import { createElement } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDocumentFontOptions } from '../../app/LIB/hook/useDocumentFontOptions';
import FontOptionPreview from '../../app/LIB/components/common/FontOptionPreview';
import { sortFontOptions } from '../../app/LIB/utils/sortFontOptions';

const { localFonts } = vi.hoisted(() => ({ localFonts: [
  { value: 'Installed Light', label: 'Installed Light', fontFamily: '"Installed Light"' },
  { value: 'Installed Bold', label: 'Installed Bold', fontFamily: '"Installed Bold"' },
] }));
vi.mock('../../app/LIB/utils/localFonts', async (importOriginal) => ({
  ...await importOriginal(),
  getLocalFontOptions: () => localFonts,
  loadLocalFonts: async () => localFonts,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('document font picker performance', () => {
  it('reuses the list across editor renders and preserves quoted or unavailable selections', async () => {
    const { result, rerender } = renderHook(({ selected }) => useDocumentFontOptions(selected), {
      initialProps: { selected: 'Installed Light' },
    });
    await act(async () => {});
    const initial = result.current;
    rerender({ selected: 'Installed Light' });
    expect(result.current).toBe(initial);
    rerender({ selected: '"Installed Bold"' });
    expect(result.current.find(font => font.value === '"Installed Bold"')?.label).toBe('Installed Bold');
    expect(result.current.find(font => font.value === 'Installed Light')?.content).toBe(initial.find(font => font.value === 'Installed Light').content);
    rerender({ selected: 'Missing Font' });
    expect(result.current.at(-1).label).toBe('Missing Font');
  });

  it('retains family, weight, and language ordering without changing the options', () => {
    const options = [
      { value: 'NotoSansTC', label: '본고딕 TC' },
      { value: 'design', label: 'Design (Eng)' },
      { value: 'kr-bold', label: '프리텐다드 Bold' },
      { value: 'kr-light', label: '프리텐다드 Light' },
      { value: 'en-bold', label: 'Arial Bold' },
      { value: 'en-light', label: 'Arial Light' },
    ];
    expect(sortFontOptions(options).map(font => font.value)).toEqual([
      'en-light', 'en-bold', 'kr-light', 'kr-bold', 'design', 'NotoSansTC',
    ]);
    expect(options[0].value).toBe('NotoSansTC');
  });

  it('activates font previews only when their rows enter the visible area', () => {
    let notify;
    const observed = [];
    const unobserve = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { notify = callback; }
      observe(element) { observed.push(element); }
      unobserve = unobserve;
    });
    const { unmount } = render(createElement('div', null,
      createElement(FontOptionPreview, { label: 'Visible', fontFamily: 'PreviewVisible' }),
      createElement(FontOptionPreview, { label: 'Below', fontFamily: 'PreviewBelow' }),
    ));
    expect(observed).toHaveLength(2);
    expect(observed[0].style.fontFamily).not.toBe('PreviewVisible');
    act(() => notify([
      { target: observed[0], isIntersecting: true },
      { target: observed[1], isIntersecting: false },
    ]));
    expect(observed[0].style.fontFamily).toBe('PreviewVisible');
    expect(observed[1].style.fontFamily).not.toBe('PreviewBelow');
    act(() => notify([{ target: observed[1], isIntersecting: true }]));
    expect(observed[1].style.fontFamily).toBe('PreviewBelow');
    unmount();
    expect(unobserve).toHaveBeenCalledWith(observed[1]);
  });
});
