"use client";

import Tex from "./Tex";
import type { LineResult } from "@/lib/ink/useLineRecognition";

type Props = { result?: LineResult; typed?: string; onRetry: () => void };

export default function LineChip({ result, typed, onRetry }: Props) {
  if (typed)
    return (
      <span className="chip done typed" title="키보드로 입력함">
        <Tex tex={typed} />
      </span>
    );
  if (!result) return null;
  if (result.status === "pending") return <span className="chip pending">인식 중…</span>;
  if (result.status === "error")
    return (
      <span
        className="chip error"
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
      >
        {result.message} · 다시
      </span>
    );
  if (!result.latex) return <span className="chip muted">?</span>;
  const low = result.confidence !== null && result.confidence < 0.5;
  return (
    <span className={`chip done ${low ? "low" : ""}`} title={result.latex}>
      <Tex tex={result.latex} />
    </span>
  );
}
