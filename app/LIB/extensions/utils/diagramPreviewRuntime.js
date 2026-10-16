import { exportToSvg } from "@excalidraw/excalidraw";
import { hasDiagramElements } from "./diagramSceneUtils";

export async function renderDiagramPreview(scene) {
  if (!hasDiagramElements(scene)) return "";
  const svg = await exportToSvg({
    elements: scene.elements.filter((element) => !element.isDeleted),
    appState: {
      ...scene.appState,
      exportBackground: true,
      exportWithDarkMode: false,
      exportEmbedScene: false
    },
    files: scene.files || {},
    exportPadding: 16
  });
  return svg.outerHTML;
}
