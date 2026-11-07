"use client";

import Tex from "./Tex";
import type { LineResult } from "@/lib/ink/useLineRecognition";

export default function LineChip({ result, onRetry }: { result?: LineResult; onRetry: () => void }) {
  if (!result) return null;
  if (result.status === "pending") return <span className="chip pending">인식 중…</span>;
  if (result.status === "error")
    return (
      <button className="chip error" onClick={onRetry}>
        {result.message} · 다시
      </button>
    );
  if (!result.latex) return <span className="chip muted">?</span>;
  const low = result.confidence !== null && result.confidence < 0.5;
  return (
    <span className={`chip done ${low ? "low" : ""}`} title={result.latex}>
      <Tex tex={result.latex} />
    </span>
  );
}
