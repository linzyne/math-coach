"use client";

import { useEffect, useState } from "react";
import { canSpeak, latexToSpeech, speakQueue, stopSpeaking } from "@/lib/useSpeech";
import Tex from "./Tex";
import type { SolutionStep } from "@/app/api/hint/route";
import { useLang, type Dict, type Lang } from "@/lib/i18n";

type Step = SolutionStep;
type State =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "loading" }
  | { kind: "fail"; message: string }
  | { kind: "show"; steps: Step[]; open: boolean };

// 같은 문제의 풀이는 다시 만들지 않음 (창을 닫았다 열어도 유지)
const solutionCache = new Map<string, Step[]>();

/** 동작 종류별 색과 아이콘 */
const KIND_STYLE: Record<string, { color: string; bg: string; icon: string }> = {
  "괄호 풀기": { color: "#7048e8", bg: "#f1ecff", icon: "🔓" },
  "분모 없애기": { color: "#0c8f80", bg: "#e3f7f4", icon: "✖️" },
  이항: { color: "#d9480f", bg: "#fff0e6", icon: "↔️" },
  "동류항 정리": { color: "#1c64d6", bg: "#e7f0ff", icon: "🧮" },
  "양변 나누기": { color: "#c2255c", bg: "#ffe8f0", icon: "➗" },
  약분: { color: "#5c7cfa", bg: "#edf2ff", icon: "✂️" },
  기타: { color: "#6b6a60", bg: "#f1efe8", icon: "✏️" },
};
const styleOf = (k?: string) => KIND_STYLE[k ?? "기타"] ?? KIND_STYLE["기타"];

/** x가 들어간 항을 파란색으로 (\max 같은 명령어 안의 x는 제외) */
function colorize(latex: string): string {
  return latex.replace(/(?<![\\a-zA-Z])((?:\d+(?:\.\d+)?)?\s*x)(?![a-zA-Z])/g, "\\textcolor{#1c64d6}{$1}");
}

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

function stepSpeech(s: Step, i: number, last: boolean, t: Dict, lang: Lang) {
  // 영어 음성에는 괄호 속 한국어 용어를 빼고 읽음
  const kind = s.kind && s.kind !== "기타" ? t.kinds[s.kind]?.replace(/\s*\(.*\)$/, "") + "." : "";
  const head = last ? t.sayAnswer : `${t.sayStep(i + 1)} ${kind}`;
  return `${head} ${latexToSpeech(s.latex, lang)}. ${s.explain}`;
}

function SolutionFlow({ problem, steps }: { problem: string; steps: Step[] }) {
  const { t, lang } = useLang();
  // 읽는 중인 위치: -1은 문제, 0부터는 단계
  const [reading, setReading] = useState<number | null>(null);
  const [voice, setVoice] = useState(false);
  useEffect(() => {
    setVoice(canSpeak());
    return () => stopSpeaking();
  }, []);

  const texts = [`${t.sayProblem} ${latexToSpeech(problem, lang)}`, ...steps.map((s, i) => stepSpeech(s, i, i === steps.length - 1, t, lang))];
  const readAll = () => speakQueue(texts, (i) => setReading(i === null ? null : i - 1), lang);
  const readOne = (idx: number) => speakQueue([texts[idx + 1]], (i) => setReading(i === null ? null : idx), lang);

  return (
    <>
      {voice && (
        <div className="read-bar">
          {reading === null ? (
            <button className="primary" onClick={readAll}>{t.readAll}</button>
          ) : (
            <button className="ghost" onClick={() => { stopSpeaking(); setReading(null); }}>{t.stopRead}</button>
          )}
          <span className="hint-sub">{t.tapCard}</span>
        </div>
      )}
    <ol className="flow">
      <li className={`flow-card flow-problem ${reading === -1 ? "reading" : ""}`} onClick={() => voice && readOne(-1)}>
        <span className="flow-tag">{t.problem}</span>
        <div className="flow-tex"><Tex tex={colorize(problem)} display /></div>
      </li>
      {steps.map((s, i) => {
        const st = styleOf(s.kind);
        const last = i === steps.length - 1;
        return (
          <li key={i} className="flow-item" style={{ ["--c" as string]: st.color, ["--bg" as string]: st.bg }}>
            <div className="flow-arrow" aria-hidden>
              {s.op ? <span className="flow-op left">{s.op}</span> : <span className="flow-op-spacer" />}
              <span className="flow-arrow-line">
                <span className="flow-kind">{st.icon} {s.kind ? t.kinds[s.kind] ?? s.kind : t.nextStep}</span>
                <svg width="22" height="30" viewBox="0 0 22 30"><path d="M11 0 V24 M3 17 L11 26 L19 17" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              {s.op ? <span className="flow-op right">{s.op}</span> : <span className="flow-op-spacer" />}
            </div>
            <div className={`flow-card ${last ? "flow-final" : ""} ${reading === i ? "reading" : ""}`} onClick={() => voice && readOne(i)}>
              <span className="flow-num">{last ? "🎯" : i + 1}</span>
              <div className="flow-tex"><Tex tex={colorize(s.latex)} display /></div>
              <p className="flow-explain">{s.explain}</p>
            </div>
          </li>
        );
      })}
    </ol>
    </>
  );
}

export default function SolutionView({ problem, onView }: { problem: string; onView: () => void }) {
  const { t, lang } = useLang();
  const [st, setSt] = useState<State>({ kind: "idle" });
  const cacheKey = `${lang}:${problem}`;

  const load = async () => {
    const cached = solutionCache.get(cacheKey);
    if (cached) {
      setSt({ kind: "show", steps: cached, open: true });
      onView();
      return;
    }
    setSt({ kind: "loading" });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch("/api/hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problem, lines: [], firstWrong: null, solution: true, lang }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSt({ kind: "fail", message: t.apiErrors[d.error ?? "unknown"] ?? t.solFail });
          return;
        }
        if (d.mode === "solution" && (await verified(problem, d.steps))) {
          solutionCache.set(cacheKey, d.steps);
          setSt({ kind: "show", steps: d.steps, open: true });
          onView();
          return;
        }
      } catch {
        setSt({ kind: "fail", message: t.netError });
        return;
      }
    }
    setSt({ kind: "fail", message: t.solFail });
  };

  if (st.kind === "idle")
    return (
      <button className="link solution-open" onClick={() => setSt({ kind: "confirm" })}>
        {t.solOpen}
      </button>
    );
  if (st.kind === "confirm")
    return (
      <div className="solution-confirm">
        <p>{t.solConfirm}</p>
        <div className="modal-actions">
          <button className="ghost" onClick={() => setSt({ kind: "idle" })}>{t.solMore}</button>
          <button className="primary" onClick={load}>{t.solYes}</button>
        </div>
      </div>
    );
  if (st.kind === "loading") return <p className="hint-loading solution-box">{t.solLoading}</p>;
  if (st.kind === "fail")
    return (
      <div className="solution-box">
        <p className="hint-sub ask-err">{st.message}</p>
        <button className="ghost" onClick={load}>{t.solTry}</button>
      </div>
    );
  return (
    <>
      <button className="link solution-open" onClick={() => setSt({ ...st, open: true })}>
        {t.solReopen}
      </button>
      {st.open && (
        <div className="modal-bg solution-bg" onClick={() => setSt({ ...st, open: false })}>
          <div className="modal solution-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.solTitle}>
            <div className="solution-head">
              <h2>{t.solTitle}</h2>
              <button className="hint-close" onClick={() => setSt({ ...st, open: false })} aria-label={t.close}>✕</button>
            </div>
            <div className="legend">
              <span><b className="legend-x">{t.legendX}</b>{t.legendXTail}</span>
              <span>{t.legendArrow}</span>
            </div>
            <SolutionFlow problem={problem} steps={st.steps} />
            <p className="hint-sub">{t.solAfter}</p>
          </div>
        </div>
      )}
    </>
  );
}
