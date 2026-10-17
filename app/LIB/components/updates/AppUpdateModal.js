import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Progress, Typography } from 'sud-ui';
import { useSetting } from '../../context/SettingContext';
import { useDarkMode } from '../../context/DarkModeContext';
import { withOverlayShadow } from '../../constant/uiProps';
import { version as currentVersion } from '../../../../package.json';

const busyStates = new Set(['downloading', 'waiting', 'saving', 'installing']);
const visibleStates = new Set(['available', 'error', ...busyStates]);

export function AppUpdateDialog({ state, theme, isDarkMode, onInstall, onCancel }) {
  const busy = busyStates.has(state.status);
  const downloading = state.status === 'downloading';
  const title = {
    available: '새 버전이 나왔어요',
    downloading: '업데이트 다운로드 중',
    waiting: '작업이 끝나기를 기다리는 중',
    saving: '문서 저장 중',
    installing: '설치 후 다시 시작하는 중',
    error: '업데이트를 완료하지 못했어요'
  }[state.status];
  return <Modal open={visibleStates.has(state.status)} title={busy ? <Typography as="h2" size="lg" pretendard="SB">{title}</Typography> : title} ariaLabel="앱 업데이트"
    width="min(400px, calc(100vw - 32px))" border={false}
    style={withOverlayShadow({}, isDarkMode)}
    onClose={busy ? undefined : onCancel} onEsc={!busy}
    footer={!busy && <div className="flex justify-end gap-2">
      <Button size="sm" background="transparent" border={false} onClick={onCancel}>취소</Button>
      <Button size="sm" colorType={theme} border={false} onClick={onInstall}>{state.status === 'error' ? '다시 시도' : '설치'}</Button>
    </div>}>
    <div className="flex min-w-0 flex-col gap-2">
      {state.preview && <Typography size="xs">미리보기 · 실제 설치하지 않아요.</Typography>}
      <div className="flex items-center justify-between gap-2">
        <Typography size="sm">{state.currentVersion} → {state.version}</Typography>
        {downloading && <Typography size="sm" pretendard="SB" color={`${theme}-8`}>{Math.floor(state.percent)}%</Typography>}
      </div>
      {downloading && <Progress size="sm" value={state.percent} showText={false} color={`${theme}-6`} backgroundColor={`${theme}-1`} aria-label="업데이트 다운로드 진행률" />}
      <Typography size="sm" role={state.status === 'error' ? 'alert' : 'status'}>
        {state.status === 'error' ? state.error : state.status === 'waiting'
          ? '진행 중인 AI 작업이 끝나면 설치를 계속해요.'
          : state.status === 'saving' ? '열려 있는 문서를 저장하고 있어요.'
            : state.status === 'installing' ? '잠시 후 앱이 다시 열려요.'
              : '문서를 저장한 뒤 설치하고 자동으로 다시 시작해요.'}
      </Typography>
    </div>
  </Modal>;
}

export default function AppUpdateModal() {
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const [state, setState] = useState({ status: 'idle' });
  const previewCleanup = useRef(null);
  const bridge = window.dockitLocal?.updates;

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const accept = value => { if (active) setState(previous => previous.preview ? previous : value); };
    const unsubscribe = bridge.onChanged(accept);
    bridge.status().then(accept).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [bridge]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const preview = event => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.code !== 'KeyU') return;
      event.preventDefault();
      previewCleanup.current?.();
      const parts = currentVersion.split('.').map(Number);
      parts[2] += 1;
      setState({ status: 'available', currentVersion, version: parts.join('.'), percent: 0, preview: true });
    };
    window.addEventListener('keydown', preview);
    return () => { window.removeEventListener('keydown', preview); previewCleanup.current?.(); };
  }, []);

  const install = async () => {
    if (state.preview && import.meta.env.DEV) {
      const { previewAppUpdate } = await import('../../../../desktop/update-preview');
      previewCleanup.current?.();
      previewCleanup.current = previewAppUpdate(setState);
      return;
    }
    try { await bridge.install(); }
    catch { setState(previous => ({ ...previous, status: 'error', error: '업데이트를 시작하지 못했습니다. 다시 시도해 주세요.' })); }
  };
  const cancel = async () => {
    if (state.preview) { previewCleanup.current?.(); setState({ status: 'idle' }); return; }
    await bridge.dismiss();
  };
  return <AppUpdateDialog state={state} theme={setting.theme} isDarkMode={isDarkMode} onInstall={install} onCancel={cancel} />;
}
