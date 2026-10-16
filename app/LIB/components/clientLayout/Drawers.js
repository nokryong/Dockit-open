import { useDrawer } from "../../context/DrawerContext";

import WidgetDrawer from "./drawer/WidgetDrawer";
import TreeDrawer from "./drawer/TreeDrawer";
import SettingsDrawer from "./drawer/SettingsDrawer";
import PluginDrawer from "./drawer/PluginDrawer";

export default function Drawers() {
  const {
    openTreeDrawer,
    openWidgetDrawer,
    openPluginDrawer,
    openSettingsDrawer,
    setOpenTreeDrawer,
    setOpenWidgetDrawer,
    setOpenPluginDrawer,
    setOpenSettingsDrawer,
  } = useDrawer();

  return (
    <>
      <WidgetDrawer
        openWidgetDrawer={openWidgetDrawer}
        setOpenWidgetDrawer={setOpenWidgetDrawer}
      />
      <TreeDrawer
        openTreeDrawer={openTreeDrawer}
        setOpenTreeDrawer={setOpenTreeDrawer}
      />
      <PluginDrawer
        openPluginDrawer={openPluginDrawer}
        setOpenPluginDrawer={setOpenPluginDrawer}
      />
      <SettingsDrawer
        openSettingsDrawer={openSettingsDrawer}
        setOpenSettingsDrawer={setOpenSettingsDrawer}
      />
    </>
  );
}
