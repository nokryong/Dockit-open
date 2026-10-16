import { useCallback, useEffect, useRef, useState } from "react";
import { createData, fetchDataList, updateData } from "../utils/dataUtils";
import { registerLocalFlusher } from "../utils/localBridge";

export function useDataManagement(endpoint, defaultData, localStorageKey, autoSaveDelay = 500) {
  const [data, setState] = useState(defaultData);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const current = useRef(defaultData);
  const ready = useRef(false);
  const dirty = useRef(false);
  const timer = useRef();
  const pending = useRef(Promise.resolve());
  const mounted = useRef(true);

  const persist = useCallback(async () => {
    clearTimeout(timer.current);
    if (!ready.current || !dirty.current) return pending.current;
    const snapshot = current.current;
    dirty.current = false;
    setIsSaving(true);
    const write = pending.current.catch(() => {}).then(() => updateData(endpoint, snapshot._id, snapshot));
    pending.current = write;
    try {
      await write;
      if (mounted.current) setError(null);
    } catch (failure) {
      dirty.current = true;
      if (mounted.current) setError(failure);
      throw failure;
    } finally { if (mounted.current) setIsSaving(false); }
  }, [endpoint]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    ready.current = false;
    const load = async () => {
      try {
        const result = await fetchDataList(endpoint);
        const stored = result.content[0] || (await createData(endpoint, null, defaultData)).content;
        if (cancelled) return;
        current.current = { ...defaultData, ...stored };
        setState(current.current);
        ready.current = true;
      } catch (failure) { if (!cancelled) setError(failure); }
      finally { if (!cancelled) setLoading(false); }
    };
    const loadingPromise = load();
    const unregister = registerLocalFlusher(async () => { await loadingPromise; await persist(); });
    return () => { cancelled = true; mounted.current = false; unregister(); clearTimeout(timer.current); if (dirty.current) persist().catch(() => {}); };
  }, [endpoint, defaultData, persist]);

  const setData = useCallback(next => {
    if (!ready.current) return;
    const value = { ...current.current, ...(typeof next === "function" ? next(current.current) : next) };
    current.current = value;
    dirty.current = true;
    setState(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist().catch(() => {}), Math.min(autoSaveDelay, 500));
  }, [autoSaveDelay, persist]);

  const saveData = useCallback(async next => {
    if (next) setData(next);
    await persist();
  }, [setData, persist]);
  return { data, setData, saveData, loading, isSaving, error };
}
