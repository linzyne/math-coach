"use client";

import { useEffect, useState } from "react";
import type { ProblemLike } from "./problems";

export type LineStatus = "ok" | "wrong" | "unparsed";
export type VerifyState = {
  statuses: Map<number, LineStatus>;
  firstWrong: number | null;
  solved: boolean;
  checking: boolean;
  error: "net" | "fail" | null;
};

const initial: VerifyState = { statuses: new Map(), firstWrong: null, solved: false, checking: false, error: null };

/** 줄 텍스트가 바뀌면 0.5초 뒤 SymPy 서버로 전체 줄을 검사 (무료, AI 미사용) */
export function useVerify(problem: ProblemLike, lineTexts: Map<number, string>): VerifyState {
  const free = problem.kind === "free";
  const [state, setState] = useState<VerifyState>(initial);
  const key = JSON.stringify([...lineTexts.entries()].sort((a, b) => a[0] - b[0]));

  useEffect(() => {
    const lines = (JSON.parse(key) as [number, string][]).map(([line, latex]) => ({ line, latex }));
    if (lines.length === 0) {
      setState(initial);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setState((s) => ({ ...s, checking: true }));
      // solve: 처음 문제와 해가 같은지 / free: 줄마다 등식이 참인지 (증명·이항정리)
      fetch(free ? "/api/py/check-lines" : "/api/py/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          free ? { lines, answer_type: problem.answerType ?? null, answer: problem.answer ?? null } : { problem: problem.latex, lines },
        ),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: { ok: boolean; results: { line: number; status: LineStatus }[]; first_wrong: number | null; solved: boolean; error?: string }) => {
          setState({
            statuses: new Map(d.results.map((r) => [r.line, r.status])),
            firstWrong: d.first_wrong,
            solved: d.solved,
            checking: false,
            error: d.ok ? null : "fail",
          });
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setState((s) => ({ ...s, checking: false, error: "net" }));
        });
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [free, problem.latex, problem.answerType, problem.answer, key]);

  return state;
}
