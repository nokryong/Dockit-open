import { ToolbarIconButton } from "@/app/LIB/components/common/toolbar/ToolbarPrimitives";

export const renderToolbarButton = (
  editor,
  icon,
  action,
  extraClass = "",
  tooltip = null,
  active = true,
  skipEditorCheck = false,
  theme = "mint",
  buttonProps = {}
) => {
  return (
    <ToolbarIconButton
      editor={editor}
      label={icon}
      onClick={action}
      extraClass={extraClass}
      tooltip={tooltip}
      active={!active}
      skipEditorCheck={skipEditorCheck}
      theme={theme}
      {...buttonProps}
    />
  );
};
