import { useEffect, useMemo, useState } from "react";
import { useTheme } from "sud-ui";
import { renderMermaidSvg } from "../../utils/mermaidRenderer";

export default function ChatMermaidDiagram({ source, dark, theme, fallback }) {
  const uiTheme = useTheme();
  const presentation = useMemo(() => {
    const colors = uiTheme.colors;
    const background = dark ? "#171717" : "#ffffff";
    const surface = colors?.[theme]?.[1] || (dark ? "#242b35" : "#f1f5f9");
    const text = colors?.black?.[10] || (dark ? "#ededed" : "#171717");
    const border = dark ? "#404040" : "#e5e5e5";
    const line = dark ? "#a3a3a3" : "#737373";
    return {
      fontFamily: 'PretendardRegular, "Segoe UI", sans-serif',
      darkMode: dark,
      background,
      primaryColor: surface,
      primaryTextColor: text,
      primaryBorderColor: surface,
      secondaryColor: background,
      secondaryTextColor: text,
      secondaryBorderColor: border,
      tertiaryColor: background,
      tertiaryTextColor: text,
      tertiaryBorderColor: border,
      lineColor: line,
      textColor: text,
      edgeLabelBackground: background,
      clusterBkg: background,
      clusterBorder: border,
      actorBkg: surface,
      actorBorder: border,
      actorTextColor: text,
      signalColor: line,
      signalTextColor: text,
    };
  }, [uiTheme.colors, theme, dark]);
  const [rendered, setRendered] = useState(null);
  useEffect(() => {
    let current = true;
    let url;
    renderMermaidSvg(source, dark, "", presentation).then((svg) => {
      if (!current) return;
      // Display as an image so diagram markup never becomes executable page DOM.
      url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      const width = Number(document.documentElement.getAttribute("viewBox")?.split(/[\s,]+/)[2]);
      setRendered({ source, presentation, url, width: Number.isFinite(width) && width > 0 ? width : undefined });
    }).catch(() => {
      if (current) setRendered({ source, presentation, error: true });
    });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, dark, presentation]);
  if (rendered?.source !== source || rendered?.presentation !== presentation)
    return <div role="status" className="p-3 text-xs opacity-70">도식 그리는 중…</div>;
  if (rendered.error) return fallback;
  return (
    <div className="max-w-full overflow-x-auto p-4" role="region" aria-label="도식" tabIndex={0}>
      <img src={rendered.url} alt="Mermaid 도식" className={`mx-auto block h-auto ${rendered.width > 360 ? "max-w-none" : "max-w-full"}`} style={{ width: rendered.width }} />
    </div>
  );
}
