import { widgets } from "../../constant/widgets";
import { usePlugins } from "../../context/PluginContext";
import PluginWidget from "../plugins/PluginWidget";

export default function WidgetRenderer({ id, preview, ...props }) {
  const { widgets: pluginWidgets } = usePlugins();
  const BuiltIn = widgets[id];
  if (BuiltIn) return <BuiltIn {...props} />;
  const widget = pluginWidgets[id];
  return widget ? <PluginWidget id={id} widget={widget} preview={preview} {...props} /> : null;
}
