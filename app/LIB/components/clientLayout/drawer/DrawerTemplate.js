import { Drawer } from "sud-ui";
import { withOverlayShadow } from "@/app/LIB/constant/uiProps";
import { useDarkMode } from "@/app/LIB/context/DarkModeContext";
import ScrollReveal from "../../common/ScrollReveal";

export default function DrawerTemplate({
  open,
  onClose,
  title,
  content,
  width = "450px",
}) {
  const { isDarkMode } = useDarkMode();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={width}
      divider={false}
      title={title}
      placement="right"
      border={false}
      style={withOverlayShadow({}, isDarkMode)}
    >
      <ScrollReveal
        direction="right"
        delay={20}
        className="flex flex-col gap-5 p-2 overflow-y-auto max-h-[calc(100dvh-90px)]"
      >
        {content}
      </ScrollReveal>
    </Drawer>
  );
}
