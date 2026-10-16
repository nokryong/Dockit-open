import { useEffect, useState } from "react";
import { renderMermaidSvg } from "../../utils/mermaidRenderer";

export default function ChatMermaidDiagram({ source, dark, fallback }) {
  const [rendered, setRendered] = useState(null);
  useEffect(() => {
    let current = true;
    let url;
    renderMermaidSvg(source, dark).then((svg) => {
      if (!current) return;
      // Display as an image so diagram markup never becomes executable page DOM.
      url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      const width = Number(document.documentElement.getAttribute("viewBox")?.split(/[\s,]+/)[2]);
      setRendered({ source, dark, url, width: Number.isFinite(width) ? width : undefined });
    }).catch(() => {
      if (current) setRendered({ source, dark, error: true });
    });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, dark]);
  if (rendered?.source !== source || rendered?.dark !== dark)
    return <div role="status" className="p-3 text-xs opacity-70">도식 그리는 중…</div>;
  if (rendered.error) return fallback;
  return (
    <div className="max-w-full overflow-x-auto p-3" role="region" aria-label="도식">
      <img src={rendered.url} alt="Mermaid 도식" className="mx-auto block h-auto w-full" style={{ minWidth: rendered.width }} />
    </div>
  );
}
