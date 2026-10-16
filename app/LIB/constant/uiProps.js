export const inputProps = {
  size: "sm",
  shadow: "none",
  color: "white-1",
  border: false,
  style: { width: "100%" }
};

export const panelInputProps = (theme, extra = {}) => ({
  ...inputProps,
  background: `${theme}-1`,
  ...extra
});

export const panelSelectProps = (theme, isDarkMode, extra = {}) => ({
  ...inputProps,
  background: `${theme}-1`,
  dropdownStyle: withOverlayShadow({}, isDarkMode),
  ...extra
});

const sudShadow = {
  none: "none",
  sm: "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.16), 0 2px 4px -1px rgba(0, 0, 0, 0.12)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.12)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.24), 0 10px 10px -5px rgba(0, 0, 0, 0.12)"
};

const defaultDropShadow =
  "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.06))";

export const getOverlayBoxShadow = () => sudShadow.lg;

export const overlayBoxShadow = getOverlayBoxShadow();

export const withOverlayShadow = (style = {}, isDarkMode) => ({
  ...style,
  boxShadow: getOverlayBoxShadow(isDarkMode)
});

export const getSurfaceShadowStyle = (size = "sm") => ({
  boxShadow: sudShadow[size] || sudShadow.sm
});

export const getInsetSurfaceShadowStyle = getSurfaceShadowStyle;

export const getDropShadowStyle = () => ({
  filter: defaultDropShadow
});

export const newShadowLightLg = {
  shadow: "lg",
  style: getSurfaceShadowStyle("lg")
};

export const newShadowDarkLg = {
  ...newShadowLightLg
};

export const newShadowLightMd = {
  shadow: "md",
  style: getSurfaceShadowStyle("md")
};

export const newShadowDarkMd = {
  ...newShadowLightMd
};

export const newShadowLightSm = {
  shadow: "sm",
  style: getSurfaceShadowStyle("sm")
};

export const newShadowDarkSm = {
  ...newShadowLightSm
};

export const newShadowLightMdInset = {
  ...newShadowLightMd
};

export const newShadowDarkMdInset = {
  ...newShadowLightMd
};

export const gradientBackground = (theme, colors) => ({
  background: `linear-gradient(145deg, ${colors[theme][6]}, ${colors[theme][7]})`
});

export const gradientBackgroundWhite = (theme, colors) => ({
  background: `linear-gradient(145deg, ${colors.white[10]}, ${colors.white[9]})`
});
export const gradientBackgroundDark = (theme, colors) => ({
  background: `linear-gradient(145deg, ${colors.black[3]}, ${colors.black[2]})`
});

export const newDropShadowLightSm = {
  style: getDropShadowStyle("sm")
};
export const newDropShadowDarkSm = {
  ...newDropShadowLightSm
};

export const newmopizmShadow = newShadowLightMd;
export const newmopizmShadowWhite = newShadowLightMd;
export const newmopizmShadowDark = newShadowDarkMd;
