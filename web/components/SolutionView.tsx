"use client";

import { useState } from "react";
import Tex from "./Tex";

type Step = { latex: string; explain: string };
type State = { kind: "idle" } | { kind: "confirm" } | { kind: "loading" } | { kind: "fail"; message: string } | { kind: "show"; steps: Step[] };

// 같은 문제의 풀이는 다시 만들지 않음 (창을 닫았다 열어도 유지)
const solutionCache = new Map<string, Step[]>();

/** Claude가 만든 풀이를 SymPy로 한 줄씩 검사해서 모두 맞을 때만 사용 */
async function verified(problem: string, steps: Step[]): Promise<boolean> {
  try {
    const r = await fetch("/api/py/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem, lines: steps.map((s, i) => ({ line: i, latex: s.latex })) }),
    });
    const d = await r.json();
    return d.ok && d.solved && d.results.length === steps.length && d.results.every((x: { status: string }) => x.status === "ok");
  } catch {
    return false;
  }
}

export default function SolutionView({ problem, onView }: { problem: string; onView: () => void }) {
  const [st, setSt] = useState<State>({ kind: "idle" });

  const load = async () => {
    const cached = solutionCache.get(problem);
    if (cached) {
      setSt({ kind: "show", steps: cached });
      onView();
      return;
    }
    setSt({ kind: "loading" });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch("/api/hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problem, lines: [], firstWrong: null, solution: true }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSt({ kind: "fail", message: d.message ?? "풀이를 받지 못했어요." });
          return;
        }
        if (d.mode === "solution" && (await verified(problem, d.steps))) {
          solutionCache.set(problem, d.steps);
          setSt({ kind: "show", steps: d.steps });
          onView();
          return;
        }
      } catch {
        setSt({ kind: "fail", message: "네트워크 오류예요." });
        return;
      }
    }
    setSt({ kind: "fail", message: "정확한 풀이를 만들지 못했어요. 다시 눌러 주세요." });
  };

  if (st.kind === "idle")
    return (
      <button className="link solution-open" onClick={() => setSt({ kind: "confirm" })}>
        📖 풀이 보기
      </button>
    );
  if (st.kind === "confirm")
    return (
      <div className="solution-confirm">
        <p>스스로 풀면 더 오래 기억나요. 그래도 풀이를 볼까요?</p>
        <div className="modal-actions">
          <button className="ghost" onClick={() => setSt({ kind: "idle" })}>조금 더 해볼게요</button>
          <button className="primary" onClick={load}>풀이 볼래요</button>
        </div>
      </div>
    );
  if (st.kind === "loading") return <p className="hint-loading solution-box">풀이를 만들고 확인하는 중…</p>;
  if (st.kind === "fail")
    return (
      <div className="solution-box">
        <p className="hint-sub ask-err">{st.message}</p>
        <button className="ghost" onClick={load}>다시 시도</button>
      </div>
    );
  return (
    <div className="solution-box">
      <div className="hint-lv">정답 풀이</div>
      <ol className="solution-steps">
        <li>
          <Tex tex={problem} />
          <span className="solution-explain">문제</span>
        </li>
        {st.steps.map((s, i) => (
          <li key={i}>
            <Tex tex={s.latex} />
            <span className="solution-explain">{s.explain}</span>
          </li>
        ))}
      </ol>
      <p className="hint-sub">풀이를 본 뒤에는 화면을 가리고 직접 다시 써 보세요.</p>
    </div>
  );
}
