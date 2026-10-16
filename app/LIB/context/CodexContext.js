import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSetting } from './SettingContext';

const CodexContext = createContext(null);
const bridge = () => window.dockitLocal?.codex;
const empty = { available: false, connected: false, account: null, signingIn: false, streaming: false, generating: false, model: '', reasoningEffort: null, serviceTier: null, usage: null };

export function CodexProvider({ children }) {
  const [connection, setConnection] = useState(empty);
  const [models, setModels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [images, setImages] = useState([]);
  const [error, setError] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [usageError, setUsageError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const { setSetting } = useSetting();
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const result = bridge() ? await bridge().status() : empty;
    setConnection(result); return result;
  }, []);
  const refreshModels = useCallback(async () => {
    const current = generation.current;
    try { const result = await bridge().models(); if (current === generation.current) setModels(result); await reload(); }
    catch (failure) { if (current === generation.current) setError(failure); }
  }, [reload]);
  const refreshUsage = useCallback(async () => {
    setUsageError(null);
    try { await bridge().usage(); await reload(); }
    catch (failure) { setUsageError(failure); }
  }, [reload]);
  useEffect(() => {
    reload().catch(setError).finally(() => setLoading(false));
    return bridge()?.onEvent(event => {
      if (event.type === 'state') reload().catch(setError);
      if (event.type === 'messages') {
        if (event.kind === 'chat') setMessages(event.messages);
        if (event.kind === 'image') setImages(event.messages);
      }
    });
  }, [reload]);
  useEffect(() => {
    const current = ++generation.current;
    setMessages([]); setImages([]); setModels([]); setError(null); setImageError(null); setUsageError(null);
    if (!connection.connected || connection.signingIn) return;
    bridge().history('chat').then(value => { if (current === generation.current) setMessages(value); }).catch(setError);
    bridge().history('image').then(value => { if (current === generation.current) setImages(value); }).catch(setImageError);
    refreshModels(); refreshUsage();
  }, [connection.connected, connection.signingIn, connection.account?.id, refreshModels, refreshUsage]);
  const run = async action => {
    setBusy(true); setError(null);
    try { const result = await action(); await reload(); return result; }
    catch (failure) { if (failure.code !== 'cancelled') setError(failure); return null; }
    finally { setBusy(false); }
  };
  const send = async (text, kind = 'chat', reference, attachments = []) => {
    const report = kind === 'image' ? setImageError : setError;
    report(null);
    try {
      const result = kind === 'image' ? await bridge().generateImage(text, reference) : await bridge().send(text, attachments);
      (kind === 'image' ? setImages : setMessages)(result.messages);
      if (result.error && result.error.code !== 'cancelled') report(result.error);
      return !result.error;
    } catch (failure) { report(failure); return false; }
  };
  return <CodexContext.Provider value={{ connection, models, messages, images, error, imageError, usageError, busy, loading,
    reload: () => run(reload), refreshModels, refreshUsage,
    signIn: () => run(async () => { const result = await bridge().signIn(); if (result.connected) setSetting(previous => ({ ...previous, aiProvider: 'codex' })); return result; }),
    cancelSignIn: () => bridge().cancelSignIn().catch(setError),
    signOut: () => run(() => bridge().signOut()),
    selectModel: slug => run(() => bridge().selectModel(slug)),
    selectReasoningEffort: effort => run(() => bridge().selectReasoningEffort(effort)),
    selectServiceTier: tier => run(() => bridge().selectServiceTier(tier)),
    clearHistory: (kind = 'chat') => run(async () => { await bridge().clearHistory(kind); (kind === 'image' ? setImages : setMessages)([]); }),
    send: (text, attachments) => send(text, 'chat', undefined, attachments), generateImage: (text, reference) => send(text, 'image', reference),
    cancelResponse: (kind = 'chat') => bridge().cancelResponse(kind).catch(kind === 'image' ? setImageError : setError),
    copyImage: id => bridge().copyImage(id).catch(setImageError),
    saveImage: id => bridge().saveImage(id).catch(setImageError)
  }}>{children}</CodexContext.Provider>;
}
export function useCodex() {
  const value = useContext(CodexContext);
  if (!value) throw new Error('CodexProvider is required');
  return value;
}
