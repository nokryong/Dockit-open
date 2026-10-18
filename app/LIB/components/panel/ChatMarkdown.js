import { createContext, memo, useContext, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import SmallButton from "../common/SmallButton";
import ChatMermaidDiagram from "./ChatMermaidDiagram";
import "katex/dist/katex.min.css";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [[rehypeKatex, { strict: "ignore", trust: false }]];
const RenderContext = createContext({ dark: false, streaming: false, theme: "sky" });
const markdownClassName = [
  "chat-markdown min-w-0 whitespace-normal break-words leading-[1.6] [overflow-wrap:anywhere]",
  "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
  "[&_p]:my-2 [&_p]:whitespace-pre-wrap",
  "[&_h1]:my-4 [&_h1]:text-xl [&_h1]:font-bold",
  "[&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-bold",
  "[&_h3]:my-3 [&_h3]:font-bold [&_h4]:my-2 [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-1 [&_li>p]:my-1 [&_li>ul]:my-1 [&_li>ol]:my-1",
  "[&_.contains-task-list]:list-none [&_input[type=checkbox]]:mr-2",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-3 [&_blockquote]:border-current/25 [&_blockquote]:pl-3 [&_blockquote]:opacity-80",
  "[&_a]:underline [&_a]:underline-offset-2 [&_hr]:my-4 [&_hr]:border-current/20",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:bg-current/5 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-left",
  "[&_td]:border-t [&_td]:border-current/15 [&_td]:px-3 [&_td]:py-2",
  "[&_pre]:whitespace-pre [&_pre]:text-sm [&_pre]:[overflow-wrap:normal]",
  "[&_code]:rounded [&_code]:bg-current/5 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden",
].join(" ");

function CodeBlock({ children }) {
  const { dark, streaming, theme } = useContext(RenderContext);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const code = children?.props?.children ?? "";
  const language = children?.props?.className?.replace("language-", "") ?? "";
  const isMermaid = language.toLowerCase() === "mermaid";
  const source = <pre className="m-0! overflow-x-auto p-3">{children}</pre>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(code).replace(/\n$/, ""));
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  if (isMermaid) {
    return (
      <div className="my-3 min-w-0 overflow-hidden rounded-2xl border border-current/15">
        {showCode ? source : streaming ? (
          <div role="status" className="p-4 text-xs opacity-70">도식 그리는 중…</div>
        ) : (
          <ChatMermaidDiagram source={String(code)} dark={dark} theme={theme} fallback={source} />
        )}
        <div className="flex items-center justify-end gap-1 px-2 pb-1">
          {!streaming && <SmallButton aria-pressed={showCode} onClick={() => setShowCode((value) => !value)}>
            {showCode ? "도식 보기" : "코드 보기"}
          </SmallButton>}
          <SmallButton onClick={copy}>
            {failed ? "복사 실패" : copied ? "복사됨" : "코드 복사"}
          </SmallButton>
        </div>
      </div>
    );
  }
  return (
    <div className="my-3 min-w-0 overflow-hidden rounded-lg border border-current/15">
      <div className="flex items-center justify-between gap-2 bg-current/5 px-3 py-1 text-xs">
        <span>{language}</span>
        <div className="flex items-center gap-2">
          <SmallButton onClick={copy}>
            {failed ? "복사 실패" : copied ? "복사됨" : "코드 복사"}
          </SmallButton>
        </div>
      </div>
      {source}
    </div>
  );
}

const components = {
  pre: CodeBlock,
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-current/15" tabIndex={0} role="region" aria-label="표">
      <table>{children}</table>
    </div>
  ),
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ""} loading="lazy" className="my-2 max-w-full rounded-lg" />
  ),
};

export default memo(function ChatMarkdown({ text, dark = false, streaming = false, theme = "sky" }) {
  return (
    <RenderContext.Provider value={{ dark, streaming, theme }}>
      <div className={markdownClassName}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        remarkRehypeOptions={{ footnoteLabel: "각주" }}
        components={components}
      >
        {text}
      </ReactMarkdown>
      </div>
    </RenderContext.Provider>
  );
});
