"use client";

import Tex from "./Tex";
import { useLang } from "@/lib/i18n";
import type { LineResult } from "@/lib/ink/useLineRecognition";

type Props = { result?: LineResult; typed?: string; onRetry: () => void };

export default function LineChip({ result, typed, onRetry }: Props) {
  const { t } = useLang();
  if (typed)
    return (
      <span className="chip done typed" title="⌨">
        <Tex tex={typed} />
      </span>
    );
  if (!result) return null;
  if (result.status === "pending") return <span className="chip pending">{t.recPending}</span>;
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
        {result.code === "net" ? t.recNet : result.code === "no_key" ? t.noKeyRec : t.recFail} · {t.retry}
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
