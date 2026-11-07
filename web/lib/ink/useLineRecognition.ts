"use client";

import { useEffect, useRef, useState } from "react";
import type { Stroke } from "./types";

export type LineResult =
  | { status: "pending" }
  | { status: "done"; latex: string; confidence: number | null }
  | { status: "error"; code: "fail" | "net" | "no_key" };

const IDLE_MS = 1200;

function signature(strokes: Stroke[]): string {
  return strokes.map((s) => s.id).sort().join(",");
}

function toPayload(strokes: Stroke[]) {
  return {
    strokes: {
      x: strokes.map((s) => s.points.map((p) => Math.round(p.x))),
      y: strokes.map((s) => s.points.map((p) => Math.round(p.y))),
    },
  };
}

/**
 * 줄마다 획이 바뀌고 1.2초간 손을 떼면 그 줄만 인식한다.
 * 같은 획 조합은 다시 보내지 않는다(되돌리기 해도 캐시 사용).
 */
export function useLineRecognition(byLine: Map<number, Stroke[]>, activeLine: number | null) {
  const [results, setResults] = useState<Map<number, LineResult>>(new Map());
  const [noKey, setNoKey] = useState(false);
  const cache = useRef(new Map<string, LineResult>());
  const sent = useRef(new Map<number, string>()); // 줄 → 마지막으로 처리한 서명
  const [tick, setTick] = useState(0);
  const retry = (line: number) => {
    sent.current.delete(line);
    setTick((t) => t + 1);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new Map<number, LineResult>();
      const toFetch: [number, string, Stroke[]][] = [];

      for (const [line, strokes] of byLine) {
        const sig = signature(strokes);
        const cached = cache.current.get(sig);
        if (cached) {
          next.set(line, cached);
        } else if (line === activeLine) {
          // 아직 쓰는 중인 줄은 기다림
          const prev = results.get(line);
          if (prev) next.set(line, prev);
        } else if (sent.current.get(line) !== sig) {
          next.set(line, { status: "pending" });
          toFetch.push([line, sig, strokes]);
        } else {
          next.set(line, results.get(line) ?? { status: "pending" });
        }
      }
      setResults(next);

      for (const [line, sig, strokes] of toFetch) {
        sent.current.set(line, sig);
        fetch("/api/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(strokes)),
        })
          .then(async (r) => {
            const d = await r.json().catch(() => ({}));
            if (r.status === 503 && d.error === "no_key") setNoKey(true);
            const res: LineResult = r.ok
              ? { status: "done", latex: d.latex ?? "", confidence: d.confidence ?? null }
              : { status: "error", code: r.status === 503 ? "no_key" : "fail" };
            if (r.ok) cache.current.set(sig, res);
            return res;
          })
          .catch((): LineResult => ({ status: "error", code: "net" }))
          .then((res) => {
            setResults((m) => {
              // 그사이 줄 내용이 바뀌었으면 버림
              if (sent.current.get(line) !== sig) return m;
              const n = new Map(m);
              n.set(line, res);
              return n;
            });
          });
      }
    }, IDLE_MS);
    return () => clearTimeout(t);
    // results는 의도적으로 제외 (무한 루프 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byLine, activeLine, tick]);

  return { results, noKey, retry };
}
