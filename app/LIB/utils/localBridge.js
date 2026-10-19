import { t as uiText } from "../i18n";
const flushers = new Set();
export const localBridge = () => {
  if (!window.dockitLocal) throw new Error(uiText("Dockit Open 데스크톱 앱에서 실행해 주세요."));
  return window.dockitLocal;
};
export const registerLocalFlusher = callback => { flushers.add(callback); return () => flushers.delete(callback); };
export const flushLocalData = async () => { await Promise.all([...flushers].map(callback => callback())); await localBridge().flush(); };
