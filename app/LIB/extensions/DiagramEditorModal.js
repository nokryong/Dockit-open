"use client";

import { useRef, useState } from "react";
import { Button, Modal } from "antd";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { renderDiagramPreview } from "./utils/diagramPreviewRuntime";
import { withDiagramChanges, withDiagramPreview } from "./utils/diagramSceneUtils";

export default function DiagramEditorModal({ session, isDarkMode, onClose }) {
  const apiRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (saving || !apiRef.current) return;
    setSaving(true);
    setError("");
    try {
      const api = apiRef.current;
      const scene = withDiagramChanges(
        session.scene,
        api.getSceneElements(),
        api.getAppState(),
        api.getFiles()
      );
      const svg = await renderDiagramPreview(scene);
      if (!session.onSave(withDiagramPreview(scene, svg))) {
        setError("다이어그램이 변경됐어요. 닫고 다시 열어주세요.");
        return;
      }
      onClose();
    } catch {
      setError("다이어그램을 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      centered
      title="다이어그램 편집"
      rootClassName="dockit-diagram-editor-modal"
      width={1100}
      style={{ maxWidth: "calc(100vw - 24px)" }}
      styles={{ content: { padding: 12 }, body: { height: "min(70dvh, 720px)", minHeight: 200 } }}
      maskClosable={false}
      closable={!saving}
      onCancel={() => { if (!saving) onClose(); }}
      footer={[
        <Button key="cancel" disabled={saving} onClick={onClose}>취소</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>완료</Button>
      ]}
    >
      <div
        data-workspace-shortcuts="ignore"
        style={{ height: "100%", position: "relative" }}
        onKeyDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Excalidraw
          autoFocus
          excalidrawAPI={(api) => { apiRef.current = api; }}
          initialData={{
            elements: session.scene.elements || [],
            appState: session.scene.appState || {},
            files: session.scene.files || {},
            scrollToContent: true
          }}
          viewModeEnabled={saving}
          theme={isDarkMode ? "dark" : "light"}
          UIOptions={{
            canvasActions: { export: false, loadScene: false, saveAsImage: false }
          }}
        />
        {error && <div className="diagram-editor-error" role="alert">{error}</div>}
      </div>
    </Modal>
  );
}
