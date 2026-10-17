// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useDataManagement } from '../../app/LIB/hook/useDataManagement';

const fixture = vi.hoisted(() => ({ stored: null, listeners: new Set() }));
vi.mock('../../app/LIB/utils/localBridge', () => ({ registerLocalFlusher: () => () => {} }));
vi.mock('../../app/LIB/utils/dataUtils', () => ({
  fetchDataList: async () => ({ content: fixture.stored ? [structuredClone(fixture.stored)] : [] }),
  createData: async (_type, _parent, data) => {
    if (fixture.stored) throw new Error('Already created');
    fixture.stored = { ...data, _id: 'default' }; return { content: structuredClone(fixture.stored) };
  },
  updateData: async (type, _id, data) => {
    fixture.stored = { ...fixture.stored, ...data };
    const content = structuredClone(fixture.stored);
    for (const listener of fixture.listeners) void listener({ type });
    return { content };
  }
}));
const initial = { theme: 'mint', language: 'ko' };
beforeEach(() => {
  fixture.stored = null;
  window.dockitLocal = { onDataChanged: callback => { fixture.listeners.add(callback); return () => fixture.listeners.delete(callback); } };
});
afterEach(() => { cleanup(); fixture.listeners.clear(); delete window.dockitLocal; });
it('simultaneous window initialization and independent settings edits preserve both changes', async () => {
  const one = renderHook(() => useDataManagement('setting', initial, 'setting'));
  const two = renderHook(() => useDataManagement('setting', initial, 'setting'));
  await waitFor(() => { expect(one.result.current.loading).toBe(false); expect(two.result.current.loading).toBe(false); });
  expect(one.result.current.error).toBe(null); expect(two.result.current.error).toBe(null);
  await act(async () => {
    one.result.current.setData(previous => ({ ...previous, theme: 'blue' }));
    two.result.current.setData(previous => ({ ...previous, language: 'en' }));
    await Promise.all([one.result.current.saveData(), two.result.current.saveData()]);
  });
  expect(fixture.stored).toMatchObject({ theme: 'blue', language: 'en' });
  await waitFor(() => {
    expect(one.result.current.data).toMatchObject({ theme: 'blue', language: 'en' });
    expect(two.result.current.data).toMatchObject({ theme: 'blue', language: 'en' });
  });
});
