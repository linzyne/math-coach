import katex from "katex";

export default function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: display });
  return <span className="tex" dangerouslySetInnerHTML={{ __html: html }} />;
}
