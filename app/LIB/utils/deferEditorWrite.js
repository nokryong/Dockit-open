// Tiptap은 React 노드 뷰를 flushSync로 그리는데, React는 커밋 중 flushSync를 거부함
// (에디터 내용을 쓰는 effect는 마이크로태스크로 미뤄서 실행, effect 정리용 취소 함수 반환)
export function deferEditorWrite(editor, write) {
  let cancelled = false;
  queueMicrotask(() => {
    if (cancelled || !editor || editor.isDestroyed) return;
    write();
  });
  return () => {
    cancelled = true;
  };
}
