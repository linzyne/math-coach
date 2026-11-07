"use client";

import { useEffect, useRef, useState } from "react";
import type { HintResponse } from "@/app/api/hint/route";
import type { LineStatus } from "@/lib/useVerify";
import type { HintLog } from "@/lib/hintLog";

type Props = {
  problem: string;
  lineTexts: Map<number, string>;
  statuses: Map<number, LineStatus>;
  firstWrong: number | null;
  checking: boolean;
  solved: boolean;
  log: HintLog;
  setLog: (h: HintLog) => void;
  /** 짚어준 줄을 캔버스에서 강조 */
  onFocusLine: (line: number | null) => void;
};

type State =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "fail"; message: string }
  | { kind: "error"; key: string; line: number; mistakeType: string; message: string; fixed: boolean }
  | { kind: "next"; key: string; hints: [string, string, string]; shown: number };

const LEVEL_LABEL = ["방향", "구체적으로", "다음 줄"];

export default function HintPanel(p: Props) {
  const [st, setSt] = useState<State>({ kind: "closed" });
  const cache = useRef(new Map<string, HintResponse>());

  const lines = [...p.lineTexts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, latex]) => ({ line, latex, status: p.statuses.get(line) }));
  const key = JSON.stringify([lines, p.firstWrong]);

  // 짚어준 줄을 학생이 고치면 칭찬하고 닫기
  const { statuses, solved, onFocusLine } = p;
  useEffect(() => {
    if (st.kind === "error" && !st.fixed && statuses.get(st.line) === "ok") {
      setSt({ ...st, fixed: true });
      onFocusLine(null);
    }
  }, [statuses, st, onFocusLine]);

  const fixedShown = st.kind === "error" && st.fixed;
  useEffect(() => {
    if (!fixedShown) return;
    const t = setTimeout(() => setSt({ kind: "closed" }), 2500);
    return () => clearTimeout(t);
  }, [fixedShown]);

  // 다 풀었으면 패널 닫기
  useEffect(() => {
    if (solved && st.kind !== "closed" && !fixedShown) {
      setSt({ kind: "closed" });
      onFocusLine(null);
    }
  }, [solved, st.kind, fixedShown, onFocusLine]);

  const show = (r: HintResponse, k: string) => {
    if (r.mode === "error") {
      setSt({ kind: "error", key: k, line: r.line, mistakeType: r.mistakeType, message: r.message, fixed: false });
      p.onFocusLine(r.line);
      p.setLog({ ...p.log, errorChecks: p.log.errorChecks + 1 });
    } else {
      setSt({ kind: "next", key: k, hints: r.hints, shown: 1 });
      p.onFocusLine(null);
      p.setLog({ ...p.log, level1: p.log.level1 + 1 });
    }
  };

  const ask = async () => {
    // 같은 풀이 상태면 이미 받은 힌트를 다시 사용 (API 호출 절약)
    const cached = cache.current.get(key);
    if (cached) return show(cached, key);
    setSt({ kind: "loading" });
    try {
      const r = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: p.problem, lines, firstWrong: p.firstWrong }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setSt({ kind: "fail", message: d.message ?? "힌트를 받지 못했어요." });
      cache.current.set(key, d as HintResponse);
      show(d as HintResponse, key);
    } catch {
      setSt({ kind: "fail", message: "네트워크 오류예요. 다시 눌러 주세요." });
    }
  };

  const more = () => {
    if (st.kind !== "next" || st.shown >= 3) return;
    const lvl = st.shown + 1;
    setSt({ ...st, shown: lvl });
    p.setLog({ ...p.log, [lvl === 2 ? "level2" : "level3"]: p.log[lvl === 2 ? "level2" : "level3"] + 1 });
  };

  const close = () => {
    setSt({ kind: "closed" });
    p.onFocusLine(null);
  };

  if (p.solved && st.kind === "closed") return null;

  return (
    <>
      {st.kind === "closed" && (
        <button className="help-fab" onClick={ask} disabled={p.checking} aria-label="도움 요청">
          🙋 도움 요청
        </button>
      )}
      {st.kind !== "closed" && (
        <div className="hint-sheet" role="dialog" aria-label="힌트">
          <button className="hint-close" onClick={close} aria-label="닫기">✕</button>
          {st.kind === "loading" && <p className="hint-loading">어디서 막혔는지 살펴보는 중…</p>}
          {st.kind === "fail" && (
            <>
              <p>{st.message}</p>
              <button className="primary" onClick={ask}>다시 요청</button>
            </>
          )}
          {st.kind === "error" &&
            (st.fixed ? (
              <p className="hint-fixed">잘 고쳤어요! 👍 계속 풀어 보세요.</p>
            ) : (
              <>
                <div className="hint-tag">
                  <b>{st.line + 1}번 줄</b>을 다시 볼까요? · <span>{st.mistakeType}</span>
                </div>
                <p className="hint-text">{st.message}</p>
                <p className="hint-sub">그 줄을 고치면 자동으로 다시 검사해요.</p>
              </>
            ))}
          {st.kind === "next" && (
            <>
              <ol className="hint-levels">
                {st.hints.slice(0, st.shown).map((h, i) => (
                  <li key={i}>
                    <span className="hint-lv">힌트 {i + 1} · {LEVEL_LABEL[i]}</span>
                    <p className="hint-text">{h}</p>
                  </li>
                ))}
              </ol>
              {st.shown < 3 ? (
                <button className="ghost" onClick={more}>
                  {st.shown === 1 ? "조금 더 알려줘요 (2/3)" : "다음 줄을 보여줘요 (3/3)"}
                </button>
              ) : (
                <p className="hint-sub">이제 직접 써 보세요!</p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
