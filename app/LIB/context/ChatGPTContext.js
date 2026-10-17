import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useChatConversations } from '../hook/useChatConversations';

const ChatGPTContext = createContext(null);
const bridge = () => window.dockitLocal?.chatgpt;
const empty = { profiles: [], active: null, signingIn: false, streaming: false };

export function ChatGPTProvider({ children }) {
  const [connection, setConnection] = useState(empty);
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const activeRef = useRef(null);
  const requestSequence = useRef(0);
  const reload = useCallback(async () => {
    const result = bridge() ? await bridge().status() : empty;
    if (activeRef.current !== result.active?.id) {
      activeRef.current = result.active?.id;
      setModels([]); setMessages([]); setError(null);
    }
    setConnection(result);
    return result;
  }, []);
  useEffect(() => {
    let mounted = true;
    reload().catch(failure => { if (mounted) setError(failure); }).finally(() => { if (mounted) setLoading(false); });
    const unsubscribe = bridge()?.onEvent(event => {
      if (event.type === 'state') reload().catch(setError);
      if (event.type === 'messages' && event.profileId === activeRef.current) setMessages(event.messages);
    });
    return () => { mounted = false; unsubscribe?.(); };
  }, [reload]);
  const refreshModels = useCallback(async () => {
    const id = activeRef.current;
    const sequence = ++requestSequence.current;
    try {
      const result = await bridge().models();
      if (activeRef.current === id && sequence === requestSequence.current) setModels(result);
      await reload();
    } catch (failure) { if (activeRef.current === id && sequence === requestSequence.current) { setModels([]); setError(failure); } }
  }, [reload]);
  useEffect(() => {
    const id = connection.active?.id;
    let current = true;
    if (!id) { setModels([]); setMessages([]); return; }
    bridge().history().then(value => { if (current && activeRef.current === id) setMessages(value); }).catch(setError);
    if (connection.active?.connected) refreshModels();
    else setModels([]);
    return () => { current = false; };
  }, [connection.active?.id, connection.active?.connected, connection.active?.sharing, refreshModels]);
  const run = useCallback(async action => {
    setBusy(true); setError(null); setNotice('');
    try { const value = await action(); await reload(); return { ok: true, value }; }
    catch (failure) { if (failure.code !== 'cancelled') setError(failure); return { ok: false }; }
    finally { setBusy(false); }
  }, [reload]);
  const signOut = () => run(async () => {
    const result = await bridge().signOut();
    if (!result.revocationConfirmed) setNotice('이 기기의 연결을 해제했습니다. 원격 해제는 확인되지 않았으니 사용량 관리에서 앱 연결을 확인해주세요.');
  });
  const send = async (text, attachments = []) => {
    setError(null);
    try {
      const result = await bridge().send(text, attachments);
      setMessages(result.messages);
      if (result.error && result.error.code !== 'cancelled') setError(result.error);
      return !result.error;
    } catch (failure) { setError(failure); return false; }
  };
  const conversations = useChatConversations({ api: bridge(), account: connection.active?.id, setMessages, setError, run });
  const value = {
    ...conversations,
    connection, models, messages, error, notice, busy, loading,
    clearError: () => setError(null), refreshModels,
    signIn: options => run(() => bridge().signIn(options)),
    cancelSignIn: () => run(() => bridge().cancelSignIn()),
    signOut,
    selectProfile: id => run(() => bridge().selectProfile(id)),
    selectModel: slug => run(() => bridge().selectModel(slug)),
    selectReasoningEffort: effort => run(() => bridge().selectReasoningEffort(effort)),
    selectServiceTier: tier => run(() => bridge().selectServiceTier(tier)),
    acknowledge: () => run(() => bridge().acknowledge()),
    openUsage: () => run(() => bridge().openUsage()),
    clearHistory: () => run(async () => { await bridge().clearHistory(); setMessages([]); }),
    send, cancelResponse: () => run(() => bridge().cancelResponse())
  };
  return <ChatGPTContext.Provider value={value}>{children}</ChatGPTContext.Provider>;
}
export function useChatGPT() {
  const value = useContext(ChatGPTContext);
  if (!value) throw new Error('ChatGPTProvider is required');
  return value;
}
