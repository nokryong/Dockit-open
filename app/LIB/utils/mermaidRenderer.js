import { embedSvgFont } from "./svgFontEmbedding";
import { loadLocalFonts } from "./localFonts";

let runtime;
let queue = Promise.resolve();
let sequence = 0;
const cache = new Map();

export function renderMermaidSvg(source, dark = false, fontFamily = "", presentation = null) {
  const key = `${dark}\0${fontFamily}\0${JSON.stringify(presentation)}\0${source}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const result = queue.then(async () => {
    if (cache.has(key)) return cache.get(key);
    runtime ??= import("mermaid").then((module) => module.default);
    const mermaid = await runtime;
    if (fontFamily) {
      // Local face aliases must exist before Mermaid measures and caches text.
      await loadLocalFonts().catch(() => {});
      await document.fonts?.load(`16px ${JSON.stringify(fontFamily)}`, source).catch(() => {});
    }
    const diagramFont = fontFamily ? JSON.stringify(fontFamily) : presentation?.fontFamily || "sans-serif";
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: presentation ? "base" : dark ? "dark" : "neutral",
      ...(presentation ? { look: "classic", themeCSS: ".node rect { rx: 12px; ry: 12px; }" } : {}),
      fontFamily: diagramFont,
      themeVariables: { ...presentation, fontFamily: diagramFont },
      htmlLabels: false,
      flowchart: { htmlLabels: false, ...(presentation ? { padding: 12, nodeSpacing: 20, rankSpacing: 32, curve: "linear" } : {}) },
    });
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(host);
    try {
      const rendered = await mermaid.render(`dockit-mermaid-${++sequence}`, source, host);
      const svg = fontFamily ? await embedSvgFont(rendered.svg, fontFamily) : rendered.svg;
      cache.set(key, svg);
      if (cache.size > 32) cache.delete(cache.keys().next().value);
      return svg;
    } finally {
      host.remove();
    }
  });
  queue = result.catch(() => {});
  return result;
}

