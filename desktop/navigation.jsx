import { useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sud-ui';
import { flushLocalData } from '../app/LIB/utils/localBridge';
const subscribe = callback => { window.addEventListener('hashchange', callback); return () => window.removeEventListener('hashchange', callback); };
const snapshot = () => window.location.hash.slice(1) || '/docs';
let pendingNavigation = Promise.resolve();
function navigate(url, replace = false) {
  if (!url.startsWith('/docs') && url !== '/') return;
  const target = url === '/' ? '/docs' : url;
  pendingNavigation = pendingNavigation.catch(() => {}).then(async () => {
    if (snapshot() === target) return;
    await flushLocalData();
    if (window.dockitLocal?.documentWindows) {
      const id = target.split('?')[0].split('/')[2];
      if (id && await window.dockitLocal.openDocument(decodeURIComponent(id)) !== decodeURIComponent(id)) return;
    }
    if (replace) { window.history.replaceState(null, '', '#' + target); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    else window.location.hash = target;
  });
  pendingNavigation.catch(error => toast.danger(error.message));
  return pendingNavigation;
}
const router = { push: url => navigate(url), replace: url => navigate(url, true), back: async () => {
  try { await flushLocalData(); window.history.back(); }
  catch (error) { toast.danger(error.message); }
}, refresh: () => window.dispatchEvent(new HashChangeEvent('hashchange')), prefetch: () => {} };
export const useRouter = () => router;
export const usePathname = () => useSyncExternalStore(subscribe, snapshot).split('?')[0];
export const useSearchParams = () => { const url = useSyncExternalStore(subscribe, snapshot); return useMemo(() => new URLSearchParams(url.split('?')[1] || ''), [url]); };
export const useParams = () => ({ id: usePathname().split('/')[2] });
export const redirect = url => navigate(url, true);
