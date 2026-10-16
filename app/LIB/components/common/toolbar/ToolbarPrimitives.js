import { forwardRef, isValidElement } from "react";
import { Button, Divider, Div, Tooltip, Typography } from "sud-ui";
import { withOverlayShadow } from "@/app/LIB/constant/uiProps";
import { hasEditorView } from "@/app/LIB/utils/editorViewUtils";

const resolveToolbarLabel = (label, size = 16) => {
  if (isValidElement(label)) {
    return label;
  }

  if (typeof label === "function") {
    const Icon = label;
    return <Icon size={size} />;
  }

  return label;
};

export const getToolbarPopoverStyle = (style = {}) => ({
  ...withOverlayShadow(),
  padding: "4px 8px",
  ...style
});

export function ToolbarDivider({
  borderColor,
  borderWeight,
  height = "20px",
  margin = "0 5px",
  style = {}
}) {
  return (
    <Divider
      vertical
      style={{ height, margin, ...style }}
      borderColor={borderColor}
      borderWeight={borderWeight}
    />
  );
}

export const ToolbarSurface = forwardRef(function ToolbarSurface(
  {
    children,
    isDarkMode,
    background = "white-10",
    className = "flex rounded-4xl px-2.5 py-0.5 items-center gap-2",
    style = {},
    ...rest
  },
  ref
) {
  return (
    <Div
      ref={ref}
      className={className}
      background={background}
      style={withOverlayShadow(style, isDarkMode)}
      {...rest}
    >
      {children}
    </Div>
  );
});

export function ToolbarIconButton({
  editor,
  label,
  onClick,
  active = false,
  theme = "mint",
  extraClass = "",
  tooltip = null,
  skipEditorCheck = false,
  disabled = false,
  size = "sm",
  iconSize = 16,
  buttonStyle = { padding: "4px" },
  preventDefaultOnMouseDown = true,
  onMouseDown,
  background,
  color,
  ...buttonProps
}) {
  const icon = resolveToolbarLabel(label, iconSize);
  const { "data-testid": testId, ...resolvedButtonProps } = buttonProps;

  const handleClick = () => {
    if (!skipEditorCheck && !hasEditorView(editor)) {
      console.warn("에디터가 아직 준비되지 않아 명령을 취소합니다.");
      return;
    }

    if (skipEditorCheck || hasEditorView(editor)) {
      onClick?.();
    }
  };

  const button = (
    <Button
      colorType="text"
      onMouseDown={(event) => {
        if (preventDefaultOnMouseDown) {
          event.preventDefault();
        }
        onMouseDown?.(event);
      }}
      onClick={handleClick}
      className={`hover-scale-8 ${extraClass}`.trim()}
      icon={icon}
      size={size}
      background={background ?? (active ? `${theme}-2` : undefined)}
      color={color ?? (active ? `${theme}-10` : `${theme}-9`)}
      style={buttonStyle}
      disabled={disabled}
      {...resolvedButtonProps}
    />
  );
  const buttonWithTestId = testId ? (
    <span data-testid={testId} style={{ display: "inline-flex" }}>
      {button}
    </span>
  ) : (
    button
  );

  if (!tooltip) {
    return buttonWithTestId;
  }

  return (
    <Tooltip
      content={
        <Typography size="xs" pretendard="M">
          {tooltip}
        </Typography>
      }
      placement="bottom"
      background={`${theme}-7`}
      color={`${theme}-1`}
      border={false}
      style={withOverlayShadow()}
    >
      {buttonWithTestId}
    </Tooltip>
  );
}
