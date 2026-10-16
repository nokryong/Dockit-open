import { Button, Modal } from "sud-ui";
import {
  newShadowDarkSm,
  newShadowLightSm,
  withOverlayShadow
} from "@/app/LIB/constant/uiProps";

export function ModalFrame({
  open,
  onClose,
  isDarkMode,
  maxWidth = "90vw",
  style = {},
  children,
  ...rest
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      style={withOverlayShadow({ maxWidth, ...style }, isDarkMode)}
      {...rest}
    >
      <div
        data-modal-root="true"
        data-workspace-shortcuts="ignore"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </Modal>
  );
}

export function ModalActionButton({
  isDarkMode,
  children,
  size = "sm",
  border = false,
  style = {},
  ...rest
}) {
  return (
    <Button
      size={size}
      border={border}
      style={{
        ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style,
        ...style
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}
