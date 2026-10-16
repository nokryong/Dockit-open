"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { localBridge } from "../utils/localBridge";
const MusicContext = createContext(null);
export function MusicProvider({ children }) {
  const [musicList, setMusicList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadAllMusic = useCallback(async () => {
    setLoading(true);
    try { setMusicList((await localBridge().data("list", { type: "music" })).content); setError(null); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadAllMusic(); }, [loadAllMusic]);
  const addMusic = useCallback(async () => {
    try { await localBridge().addMusic(); await loadAllMusic(); }
    catch (failure) { setError(failure.message); }
  }, [loadAllMusic]);
  const removeMusic = useCallback(async id => {
    try { await localBridge().removeMusic(id); await loadAllMusic(); }
    catch (failure) { setError(failure.message); }
  }, [loadAllMusic]);
  const value = useMemo(() => ({ musicList, loading, error, addMusic, removeMusic }), [musicList, loading, error, addMusic, removeMusic]);
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}
export const useMusic = () => useContext(MusicContext);
