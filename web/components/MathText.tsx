import katex from "katex";

/** "Prove that $\sum r = ...$ for all $n$" 처럼 글과 $수식$이 섞인 문장을 렌더링 */
export default function MathText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("$")) {
          const display = part.startsWith("$$");
          const tex = part.slice(display ? 2 : 1, display ? -2 : -1);
          return <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { throwOnError: false, displayMode: display }) }} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
