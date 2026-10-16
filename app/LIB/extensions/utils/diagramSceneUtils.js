export function parseDiagramScene(sceneData) {
  try {
    const scene = JSON.parse(sceneData || "{}");
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) return null;
    if (scene.elements != null && !Array.isArray(scene.elements)) return null;
    if (scene.elements?.some((element) => !element || typeof element !== "object")) return null;
    return scene;
  } catch {
    return null;
  }
}

export function hasDiagramElements(scene) {
  return Boolean(scene?.elements?.some((element) => !element.isDeleted));
}

// The preview must be invalidated when either geometry, styling, or files change.
export function getDiagramSourceKey(scene) {
  const source = JSON.stringify([
    scene?.elements || [],
    scene?.appState || {},
    scene?.files || {}
  ]);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return `${source.length}:${hash >>> 0}`;
}

export function getSavedDiagramPreview(scene) {
  const preview = scene?.dockitPreview;
  return preview?.version === 1 &&
    preview.sourceKey === getDiagramSourceKey(scene) &&
    typeof preview.svg === "string" &&
    preview.svg.startsWith("<svg") &&
    preview.svg.endsWith("</svg>")
    ? preview.svg
    : "";
}

export function withDiagramPreview(scene, svg) {
  return {
    ...scene,
    dockitPreview: { version: 1, sourceKey: getDiagramSourceKey(scene), svg }
  };
}

export function withDiagramChanges(original, elements, appState, files) {
  const { dockitPreview: _preview, ...scene } = original;
  return {
    ...scene,
    elements,
    appState: {
      ...original.appState,
      viewBackgroundColor: appState.viewBackgroundColor,
      currentItemStrokeColor: appState.currentItemStrokeColor,
      currentItemBackgroundColor: appState.currentItemBackgroundColor
    },
    files: files || {}
  };
}
