import { Div, Typography } from "sud-ui";
import { useSetting } from "@/app/LIB/context/SettingContext";

export { default as SmallButton } from "../../../common/SmallButton";

export const TitleComponent = ({ children, icon, id }) => {
  const { setting } = useSetting();
  const Icon = icon;

  return (
    <div className="flex items-center gap-2">
      <Div color={`${setting.theme}-7`}>
        <Icon size={25} />
      </Div>
      <Typography id={id} pretendard="SB">{children}</Typography>
    </div>
  );
};
