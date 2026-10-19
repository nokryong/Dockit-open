export const HANDLE_SIZE = 15;
export const EDGE_HANDLE_LENGTH = 70;
export const CORNER_HANDLE_SIZE = 15;
export const CORNER_HANDLE_STROKE = 2;

export const createResizeHandleStyle = (
  accentColor,
  showHandles,
  extra = {},
  options = {}
) => {
  const { borderRadius = 2, zIndex = 10 } = options;

  return {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    border: `${CORNER_HANDLE_STROKE}px solid ${accentColor}`,
    background: "#fff",
    boxSizing: "border-box",
    borderRadius,
    zIndex,
    opacity: showHandles ? 1 : 0,
    pointerEvents: showHandles ? "auto" : "none",
    transition: "opacity 0.15s",
    ...extra
  };
};

export const createSelectionFrameStyle = (
  accentColor,
  showFrame,
  extra = {},
  options = {}
) => {
  const {
    borderRadius = 0,
    borderWidth = 2,
    zIndex = 11,
    boxShadow = "none"
  } = options;

  return {
    position: "absolute",
    inset: 0,
    border: `${borderWidth}px solid ${accentColor}`,
    borderRadius,
    boxSizing: "border-box",
    pointerEvents: "none",
    opacity: showFrame ? 1 : 0,
    zIndex,
    boxShadow,
    transition: "opacity 0.15s, border-color 0.15s",
    ...extra
  };
};

export const createCornerResizeHandleContainerStyle = (
  accentColor,
  showHandle,
  extra = {},
  options = {}
) => {
  const { zIndex = 12 } = options;

  return {
    position: "absolute",
    width: CORNER_HANDLE_SIZE,
    height: CORNER_HANDLE_SIZE,
    border: `${CORNER_HANDLE_STROKE}px solid ${accentColor}`,
    background: "#fff",
    boxSizing: "border-box",
    borderRadius: 999,
    zIndex,
    opacity: showHandle ? 1 : 0,
    pointerEvents: showHandle ? "auto" : "none",
    transition: "opacity 0.15s",
    ...extra
  };
};

export const getObjectSelectionVisibility = ({
  editor,
  selected = false,
  isResizing = false,
  isEditing = false
} = {}) => {
  const isReadOnlyContainer = Boolean(
    editor?.view?.dom?.closest?.(".tiptap-container.is-readonly")
  );

  const hasActiveInteraction = selected || isResizing || isEditing;

  const canInteract =
    Boolean(editor) &&
    !isReadOnlyContainer &&
    (editor?.isEditable || hasActiveInteraction);

  const showSelectionChrome = canInteract && hasActiveInteraction;

  return {
    canInteract,
    showSelectionChrome
  };
};

export const createObjectSelectionChrome = ({
  accentColor,
  showSelectionChrome,
  borderRadius = 0,
  frameZIndex = 11,
  handleZIndex = 12
}) => ({
  selectionFrameStyle: createSelectionFrameStyle(
    accentColor,
    showSelectionChrome,
    {},
    {
      borderRadius,
      zIndex: frameZIndex
    }
  ),

  edgeHandleStyle: (extra) =>
    createResizeHandleStyle(accentColor, showSelectionChrome, extra, {
      borderRadius: 999,
      zIndex: handleZIndex
    }),

  cornerHandleStyle: (extra) =>
    createCornerResizeHandleContainerStyle(
      accentColor,
      showSelectionChrome,
      extra,
      {
        zIndex: handleZIndex
      }
    )
});
