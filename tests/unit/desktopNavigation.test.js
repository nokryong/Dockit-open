/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sud-ui', () => ({ toast: { danger: vi.fn() } }));
vi.mock('../../app/LIB/utils/localBridge', () => ({ flushLocalData: vi.fn(async () => {}) }));

beforeEach(() => {
  vi.resetModules();
  window.history.replaceState(null, '', '#/docs');
  window.dockitLocal = {
    documentWindows: true,
    openDocument: vi.fn(async id => id),
    openWorkspace: vi.fn(),
  };
});

describe('desktop in-app navigation', () => {
  it('opens a document in the current route and returns to its workspace in the same window', async () => {
    const { useRouter } = await import('../../desktop/navigation.jsx');
    await useRouter().push('/docs/doc-one');
    expect(window.location.hash).toBe('#/docs/doc-one');
    expect(window.dockitLocal.openDocument).toHaveBeenCalledWith('doc-one');
    await useRouter().push('/docs?folder=one');
    expect(window.location.hash).toBe('#/docs?folder=one');
    expect(window.dockitLocal.openWorkspace).not.toHaveBeenCalled();
  });

  it('does not open a second editor when the document is already in another window', async () => {
    window.dockitLocal.openDocument.mockResolvedValue(null);
    const { useRouter } = await import('../../desktop/navigation.jsx');
    await useRouter().push('/docs/doc-open-elsewhere');
    expect(window.location.hash).toBe('#/docs');
  });

  it('leaves the current document open if saving fails', async () => {
    const { flushLocalData } = await import('../../app/LIB/utils/localBridge');
    flushLocalData.mockRejectedValueOnce(new Error('save failed'));
    const { useRouter } = await import('../../desktop/navigation.jsx');
    await expect(useRouter().push('/docs/doc-two')).rejects.toThrow('save failed');
    expect(window.dockitLocal.openDocument).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/docs');
  });
});
