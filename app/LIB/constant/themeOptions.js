import { t as uiText } from "../i18n";
import { Div, Typography } from "sud-ui";

const rawColorList = [
  { value: "red", label: "Red" },
  { value: "rose", label: "Rose" },
  { value: "coral", label: "Coral" },
  { value: "orange", label: "Orange" },
  { value: "volcano", label: "Volcano" },
  { value: "apricot", label: "Apricot" },
  { value: "yellow", label: "Yellow" },
  { value: "gold", label: "Gold" },
  { value: "amber", label: "Amber" },
  { value: "green", label: "Green" },
  { value: "lime", label: "Lime" },
  { value: "mint", label: "Mint" },
  { value: "blue", label: "Blue" },
  { value: "sky", label: "Sky" },
  { value: "cerulean", label: "Cerulean" },
  { value: "indigo", label: "Indigo" },
  { value: "cobalt", label: "Cobalt" },
  { value: "navy", label: "Navy" },
  { value: "purple", label: "Purple" },
  { value: "plum", label: "Plum" },
  { value: "orchid", label: "Orchid" },
  { value: "forest", label: "Forest" },
  { value: "sage", label: "Sage" },
  { value: "warm-gray", label: "Warm Gray" },
  { value: "cool-gray", label: "Cool Gray" },
  { value: "black", label: "Black" }
];

export const themeOptions = rawColorList.map((color) => ({
  ...color, // value와 label은 그대로 유지
  content: (
    <Div
      className="p-2.5 rounded-xl"
      background={`${color.value}-7`}
      color={`${color.value}-1`}
    >
      <Typography pretendard="SB">{color.label}</Typography>
    </Div>
  )
}));

export const imageSearchColorList = [
  { value: "red", label: "Red", hex: "#FF0000", iconColor: "#FFFFFF" },
  { value: "orange", label: "orange", hex: "#FFA500", iconColor: "#000000" },
  { value: "yellow", label: "Yellow", hex: "#FFFF00", iconColor: "#000000" },
  { value: "green", label: "Green", hex: "#008000", iconColor: "#FFFFFF" },
  {
    value: "turquoise",
    label: "Turquoise",
    hex: "#40E0D0",
    iconColor: "#000000"
  },
  { value: "blue", label: "Blue", hex: "#0000FF", iconColor: "#FFFFFF" },
  { value: "lilac", label: "Lilac", hex: "#E6E6FA", iconColor: "#000000" },
  { value: "pink", label: "Pink", hex: "#FFC0CB", iconColor: "#000000" },
  { value: "white", label: "White", hex: "#FFFFFF", iconColor: "#000000" },
  { value: "gray", label: "Gray", hex: "#606060", iconColor: "#FFFFFF" },
  { value: "black", label: "Black", hex: "#000000", iconColor: "#FFFFFF" },
  { value: "brown", label: "Brown", hex: "#A52A2A", iconColor: "#FFFFFF" }
];

export const imageSearchOption = [
  { value: "none", get label() { return uiText("전체"); }, hex: "none", iconColor: "none" },
  {
    value: "transparent",
    get label() { return uiText("투명 배경"); },
    hex: "transparent",
    iconColor: "#000000"
  },
  { value: "grayscale", get label() { return uiText("흑백"); }, hex: "none", iconColor: "none" }
];
