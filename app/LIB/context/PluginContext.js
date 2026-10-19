"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { localBridge } from "../utils/localBridge";
import { usePanels } from "./PanelContext";
import { useSetting } from './SettingContext';
import { localizePlugin } from '../utils/pluginLocalization';

const PluginContext = createContext(null);
export const pluginWidgetId = (pluginId, widgetId) => `plugin:${pluginId}/${widgetId}`;

export function PluginProvider({ children }) {
  const [rawPlugins, setPlugins] = useState([]);
  const { setting } = useSetting();
  const plugins = useMemo(() => rawPlugins.map(plugin => localizePlugin(plugin, setting.language)), [rawPlugins, setting.language]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { left, right, remove } = usePanels();
  const accept = useCallback(result => {
    setPlugins(result.plugins);
    setWarnings(result.warnings);
    setError("");
    setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    try { accept(await localBridge().plugins.list()); }
    catch (failure) { setError(failure.message); setLoading(false); }
  }, [accept]);

  useEffect(() => {
    let unsubscribe;
    try { unsubscribe = localBridge().plugins.onChanged(accept); }
    catch (failure) { setError(failure.message); setLoading(false); return; }
    refresh();
    return unsubscribe;
  }, [accept, refresh]);

  const widgets = useMemo(() => Object.fromEntries(plugins.flatMap(plugin => plugin.widgets.map(widget => [
    pluginWidgetId(plugin.id, widget.id), { ...widget, pluginId: plugin.id, pluginName: plugin.name, pluginVersion: plugin.version },
  ]))), [plugins]);

  useEffect(() => {
    if (loading || error) return;
    for (const id of new Set([...left, ...right])) if (id.startsWith('plugin:') && !widgets[id]) remove(id);
  }, [left, right, widgets, loading, error, remove]);

  const value = useMemo(() => ({ plugins, widgets, warnings, loading, error, refresh }), [plugins, widgets, warnings, loading, error, refresh]);
  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

export function usePlugins() { return useContext(PluginContext); }
