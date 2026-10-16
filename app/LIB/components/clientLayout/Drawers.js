import { useDrawer } from "../../context/DrawerContext";

import WidgetDrawer from "./drawer/WidgetDrawer";
import TreeDrawer from "./drawer/TreeDrawer";
import SettingsDrawer from "./drawer/SettingsDrawer";

export default function Drawers() {
  const {
    openTreeDrawer,
    openWidgetDrawer,
    openSettingsDrawer,
    setOpenTreeDrawer,
    setOpenWidgetDrawer,
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
      <SettingsDrawer
        openSettingsDrawer={openSettingsDrawer}
        setOpenSettingsDrawer={setOpenSettingsDrawer}
      />
    </>
  );
}
