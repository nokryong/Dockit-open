// colStyle.js
export function getColStyleDeclaration(minWidth, width) {
  if (width) {
    // 저장된 너비가 설정된 최소 셀 너비보다 작지 않은 한 해당 너비를 적용합니다.
    return ["width", `${Math.max(width, minWidth)}px`];
  }

  // 저장된 너비가 없는 경우 컬럼에 최소 너비를 설정합니다.
  return ["min-width", `${minWidth}px`];
}
