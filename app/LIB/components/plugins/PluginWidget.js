import { t as uiText, useI18n, translateMessage } from "../../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Typography, toast } from "sud-ui";
import { TbKey, TbMinus, TbPlus, TbRefresh } from "react-icons/tb";
import WidgetCard from "../panel/WidgetCard";
import SmallButton from "../common/SmallButton";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { localBridge } from "../../utils/localBridge";
import { getPluginIcon } from "./PluginIcon";
import { PluginCredentialDialog, PluginImageDialog } from './PluginDialogs';

const CHANNEL = 'dockit-plugin-v1';
const actionIcons = { plus: TbPlus, minus: TbMinus, refresh: TbRefresh, key: TbKey };
const post = (frame, value) => frame?.contentWindow?.postMessage({ channel: CHANNEL, ...value }, '*');

export default function PluginWidget({ id, widget, dragHandleProps, preview = false }) {
  const language = useI18n();
  const { setting } = useSetting();
  const { isDarkMode, currentColors } = useDarkMode();
  const frameRef = useRef(null);
  const [session, setSession] = useState(null);
  const [height, setHeight] = useState(120);
  const [actions, setActions] = useState([]);
  const [footer, setFooter] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [credentialPrompt, setCredentialPrompt] = useState(null);
  const credentialReply = useRef(null);
  const credentialBusy = useRef(false);
  const [imagePreview, setImagePreview] = useState(null);
  const closeCredentials = status => {
    credentialReply.current?.(status);
    credentialReply.current = null;
    setCredentialPrompt(null);
  };
  const theme = useMemo(
    () => ({
      name: setting.theme,
      isDarkMode,
      colors: currentColors,
      fontFamily: setting.fontFamily || "Pretendard"
    }),
    [setting.theme, setting.fontFamily, isDarkMode, currentColors]
  );
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    if (preview) return;
    let disposed = false;
    let opened;
    const bridge = localBridge().plugins;
    setError(""); setReady(false); setActions([]); setFooter(""); setSession(null);
    setCredentialPrompt(null); setImagePreview(null);
    bridge.open(widget.pluginId, widget.id).then(result => {
      opened = result;
      if (disposed) bridge.close(result.sessionId).catch(() => {});
      else setSession(result);
    }).catch(failure => { if (!disposed) setError(failure.message); });
    return () => { disposed = true; if (opened) bridge.close(opened.sessionId).catch(() => {}); };
  }, [widget.pluginId, widget.id, widget.pluginVersion, attempt, preview]);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let inFlight = 0;
    const stop = message => {
      setError(message); setReady(false); setActions([]); setFooter(""); setSession(null);
      localBridge().plugins.close(session.sessionId).catch(() => {});
    };
    const timer = setTimeout(() => stop(uiText("플러그인을 불러오지 못했습니다.")), 15000);
    const unsubscribe = localBridge().plugins.onStopped(event => { if (event.sessionId === session.sessionId) stop(event.message); });
    const listener = async event => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== CHANNEL) return;
      const message = event.data;
      if (message.type === 'error') { stop(uiText("플러그인 실행 중 오류가 발생했습니다.")); return; }
      if (message.type === 'ready') {
        clearTimeout(timer);
        setReady(true); setError("");
        post(frame, { type: 'init', theme: themeRef.current, language: languageRef.current });
        return;
      }
      if (message.type === 'resize') {
        if (Number.isFinite(message.height)) setHeight(Math.max(48, Math.min(720, Math.ceil(message.height))));
        return;
      }
      if (message.type !== 'request' || typeof message.requestId !== 'string' || message.requestId.length > 64) return;
      const reply = value => { if (!disposed) post(frame, { type: 'response', requestId: message.requestId, ...value }); };
      if (inFlight >= 32) { reply({ error: uiText("진행 중인 플러그인 요청이 너무 많습니다.") }); return; }
      inFlight++;
      try {
        let value = true;
        if (['storage.get', 'storage.set', 'storage.remove'].includes(message.method)) {
          const payload = message.payload;
          if (!payload || JSON.stringify(payload).length > 8 * 1024 * 1024) throw new Error(uiText("잘못된 플러그인 데이터입니다."));
          value = await localBridge().plugins.storage(session.sessionId, message.method.split('.')[1], payload.key, payload.value);
        } else if (message.method === 'credentials.configure') {
          if (credentialBusy.current) throw new Error(uiText("열려 있는 API Key 창을 먼저 닫아주세요."));
          credentialBusy.current = true;
          try {
            const prompt = await localBridge().plugins.request(session.sessionId, 'credentials.status', message.payload);
            if (disposed) return;
            value = await new Promise(resolve => { credentialReply.current = resolve; setCredentialPrompt(prompt); });
          } finally { credentialBusy.current = false; }
        } else if (['credentials.status', 'network.get', 'images.load', 'images.download', 'external.open', 'images.preview'].includes(message.method)) {
          if (JSON.stringify(message.payload || {}).length > 65536) throw new Error(uiText("플러그인 요청이 너무 큽니다."));
          value = await localBridge().plugins.request(session.sessionId, message.method, message.payload);
          if (message.method === 'images.preview') { if (!disposed) setImagePreview(value); value = true; }
        } else if (message.method === 'notify') {
          const { message: text, type = 'danger' } = message.payload || {};
          if (typeof text !== 'string' || text.length > 1000 || !['danger', 'warning', 'info'].includes(type)) throw new Error(uiText("잘못된 알림입니다."));
          toast[type](text);
        } else if (message.method === 'actions') {
          if (
            !Array.isArray(message.payload) ||
            message.payload.length > 5 ||
            message.payload.some(
              (action) =>
                !action ||
                typeof action.id !== "string" ||
                action.id.length > 64 ||
                typeof action.label !== "string" ||
                action.label.length > 60
            )
          )
            throw new Error(uiText("잘못된 툴킷 버튼입니다."));
          setActions(message.payload.map(action => ({ id: action.id, label: action.label, icon: action.icon, disabled: action.disabled === true })));
        } else if (message.method === 'footer') {
          if (typeof message.payload !== 'string' || message.payload.length > 200) throw new Error(uiText("잘못된 툴킷 하단 내용입니다."));
          setFooter(message.payload);
        } else throw new Error(uiText("지원하지 않는 플러그인 요청입니다."));
        reply({ value });
      } catch (failure) { reply({ error: failure.message }); }
      finally { inFlight--; }
    };
    window.addEventListener('message', listener);
    return () => { disposed = true; credentialReply.current?.(null); credentialReply.current = null; clearTimeout(timer); unsubscribe(); window.removeEventListener('message', listener); };
  }, [session]);

  useEffect(() => { post(frameRef.current, { type: 'theme', theme }); }, [theme, ready]);
  useEffect(() => { post(frameRef.current, { type: 'language', language }); }, [language, ready]);

  return (
    <WidgetCard
      icon={getPluginIcon(widget.iconAsset || widget.icon)}
      title={widget.title}
      widgetType={id}
      dragHandleProps={dragHandleProps}
      titleBtn={
        <div className="flex items-center gap-1">
          {actions.map((action) => {
            const Icon = actionIcons[action.icon];
            return (
              <Button
                key={action.id}
                size="sm"
                ariaLabel={action.label}
                color={`${setting.theme}-8`}
                background="transparent"
                border={false}
                disabled={action.disabled}
                icon={Icon ? <Icon size={16} /> : undefined}
                onClick={() =>
                  post(frameRef.current, { type: "action", id: action.id })
                }
              >
                {!Icon && action.label}
              </Button>
            );
          })}
        </div>
      }
      footer={footer ? <Typography size="xs">{footer}</Typography> : undefined}
    >
      {preview ? (
        <div className="h-16" />
      ) : (
        <>
          {error && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <Typography size="sm">{translateMessage(error)}</Typography>
              <SmallButton onClick={() => setAttempt((value) => value + 1)}>
                {uiText("다시 시도")}
              </SmallButton>
            </div>
          )}
          {!ready && !error && (
            <Typography size="sm">{uiText("불러오는 중…")}</Typography>
          )}
          {session && (
            <iframe
              ref={frameRef}
              title={uiText("{0} 플러그인", widget.title)}
              src={session.url}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              onLoad={() =>
                post(frameRef.current, {
                  type: "init",
                  theme: themeRef.current,
                  language: languageRef.current
                })
              }
              className="block w-full border-0"
              style={{ height, display: error ? "none" : undefined }}
            />
          )}
          {session && credentialPrompt && (
            <PluginCredentialDialog
              key={`${session.sessionId}/${credentialPrompt.id}`}
              prompt={credentialPrompt}
              sessionId={session.sessionId}
              theme={setting.theme}
              onClose={closeCredentials}
            />
          )}
          {session && imagePreview && (
            <PluginImageDialog
              key={imagePreview.url}
              image={imagePreview}
              sessionId={session.sessionId}
              theme={setting.theme}
              isDarkMode={isDarkMode}
              onClose={() => setImagePreview(null)}
            />
          )}
        </>
      )}
    </WidgetCard>
  );
}
