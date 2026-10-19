// Preloaded into every vitest worker fork (see vitest.config.mjs poolOptions).
// The native `canvas` addon (pulled in by fabric/jsdom as an optional dependency)
// intermittently crashes worker processes with STATUS_ACCESS_VIOLATION (0xC0000005)
// during process teardown on Windows, which fails the fail-closed release gate even
// when every test passes. No unit test uses a real 2D context, so we force jsdom's
// graceful no-canvas fallback by making `require("canvas")` unresolvable here.
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
