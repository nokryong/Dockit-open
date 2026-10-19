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
  const changedFields = useRef({});
  const timer = useRef();
  const pending = useRef(Promise.resolve());
  const mounted = useRef(true);

  const persist = useCallback(async () => {
    clearTimeout(timer.current);
    if (!ready.current || !dirty.current) return pending.current;
    const snapshot = { ...changedFields.current };
    const id = current.current._id;
    changedFields.current = {};
    dirty.current = false;
    setIsSaving(true);
    const write = pending.current.catch(() => {}).then(() => updateData(endpoint, id, snapshot));
    pending.current = write;
    try {
      const result = await write;
      if (result?.content) {
        current.current = { ...current.current, ...result.content, ...changedFields.current };
        if (mounted.current) setState(current.current);
      }
      if (mounted.current) setError(null);
    } catch (failure) {
      dirty.current = true;
      changedFields.current = { ...snapshot, ...changedFields.current };
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
        let stored = result.content[0];
        if (!stored) {
          try { stored = (await createData(endpoint, null, defaultData)).content; }
          catch (failure) {
            // Another window can create the shared default record at the same time.
            stored = (await fetchDataList(endpoint)).content[0];
            if (!stored) throw failure;
          }
        }
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

  useEffect(() => window.dockitLocal?.onDataChanged(async event => {
    if (event.type !== endpoint || !ready.current) return;
    try {
      await pending.current.catch(() => {});
      const result = await fetchDataList(endpoint);
      if (!mounted.current || !result.content[0]) return;
      current.current = { ...defaultData, ...result.content[0], ...changedFields.current };
      setState(current.current);
    } catch (failure) { if (mounted.current) setError(failure); }
  }), [endpoint, defaultData]);

  const setData = useCallback(next => {
    if (!ready.current) return;
    const value = { ...current.current, ...(typeof next === "function" ? next(current.current) : next) };
    for (const [key, field] of Object.entries(value)) {
      if (key !== '_id' && JSON.stringify(field) !== JSON.stringify(current.current[key])) changedFields.current[key] = field;
    }
    if (!Object.keys(changedFields.current).length) return;
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
