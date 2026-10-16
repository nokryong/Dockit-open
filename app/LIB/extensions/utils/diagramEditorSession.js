let activeSession = null;
const listeners = new Set();

export const getDiagramEditorSession = () => activeSession;
export const getServerDiagramEditorSession = () => null;

export function subscribeDiagramEditor(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openDiagramEditor(session) {
  activeSession = session;
  listeners.forEach((listener) => listener());
}

export function closeDiagramEditor(owner) {
  if (activeSession?.owner !== owner) return;
  activeSession = null;
  listeners.forEach((listener) => listener());
}
