import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ClientLayout from '../app/ClientLayout';
import Workspace from '../app/docs/page';
import { usePathname } from './navigation';
import { flushLocalData } from '../app/LIB/utils/localBridge';
import { loadLocalFonts } from '../app/LIB/utils/localFonts';
import '../app/globals.css';
import '../app/LIB/css/koreaWebFont.css';
import '../app/LIB/css/tiptap.css';
import '../app/LIB/css/animation.css';
import '../app/LIB/css/print-mode.css';

const DocumentPage = lazy(() => import('../app/docs/[id]/page'));

function CloseHandler() {
  const [error, setError] = useState('');
  useEffect(() => window.dockitLocal.onPrepareClose(async () => {
    try {
      await flushLocalData();
      await window.dockitLocal.closeReady();
    } catch (failure) { setError(failure.message); }
  }), []);
  useEffect(() => window.dockitLocal.onPrepareSave(async id => {
    try { await flushLocalData(); await window.dockitLocal.saveReady(id, { ok: true }); }
    catch (failure) { await window.dockitLocal.saveReady(id, { ok: false, message: failure.message }); }
  }), []);
  return error ? <div role="alert" style={{ position: 'fixed', bottom: 40, left: 20, zIndex: 10000, background: '#fff0f0', padding: 16 }}>{error}<button onClick={() => setError('')}>닫기</button></div> : null;
}
function Routes() { const pathname = usePathname(); return <><CloseHandler /><Suspense fallback={null}>{pathname.split('/')[2] ? <DocumentPage /> : <Workspace />}</Suspense></>; }
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <div role="alert">앱을 열지 못했습니다: {this.state.error.message}</div> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><ClientLayout><Routes /></ClientLayout></ErrorBoundary>);

const warmLocalFonts = () => loadLocalFonts().catch(error => console.warn('로컬 글꼴 목록을 불러오지 못했습니다.', error));
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(warmLocalFonts, { timeout: 1000 });
} else {
  setTimeout(warmLocalFonts, 0);
}
