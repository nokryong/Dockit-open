// 모든 vitest 워커 프로세스에 미리 로드 (vitest.config.mjs의 poolOptions 참고)
// (fabric/jsdom이 선택 의존성으로 끌어오는 네이티브 `canvas` 애드온이 Windows에서 프로세스 종료 중 STATUS_ACCESS_VIOLATION(0xC0000005)으로 워커를 가끔 죽여서, 테스트가 다 통과해도 릴리즈 검사가 실패함)
// (실제 2D 컨텍스트를 쓰는 단위 테스트가 없으므로 `require("canvas")`를 여기서 찾지 못하게 해서 jsdom의 canvas 없는 대체 경로 사용)
const Module = require("module");

const originalLoad = Module._load;

Module._load = function blockNativeCanvas(request, parent, isMain) {
  if (request === "canvas") {
    const error = new Error(
      "Cannot find module 'canvas' (blocked in unit tests: native addon crashes vitest workers at exit)"
    );
    error.code = "MODULE_NOT_FOUND";
    throw error;
  }
  return originalLoad.call(this, request, parent, isMain);
};
