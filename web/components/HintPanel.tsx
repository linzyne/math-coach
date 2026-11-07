"use client";

import { useEffect, useRef, useState } from "react";
import type { HintResponse } from "@/app/api/hint/route";
import type { LineStatus } from "@/lib/useVerify";
import type { HintLog } from "@/lib/hintLog";
import { speak, speakable, useSpeech } from "@/lib/useSpeech";
import SolutionView from "./SolutionView";
import MathText from "./MathText";
import { cacheGet, cacheSet } from "@/lib/persistCache";
import { useLang } from "@/lib/i18n";

type Props = {
  problem: string;
  kind: "solve" | "free";
  answerType?: string;
  /** free 문제에서 Claude가 풀이 전체를 맞다고 확인함 */
  onReviewedOk: () => void;
  /** solve 문제의 방정식 (풀이 검증용) */
  latex?: string;
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
  | { kind: "next"; key: string; hints: [string, string, string]; shown: number }
  | { kind: "review"; correct: boolean; feedback: string; line: number | null };


export default function HintPanel(p: Props) {
  const { t, lang } = useLang();
  const errMsg = (d: { error?: string; detail?: string }) =>
    (t.apiErrors[d.error ?? "unknown"] ?? t.hintFail) + (d.detail ? ` (${d.detail})` : "");
  const [st, setSt] = useState<State>({ kind: "closed" });
  const [qa, setQa] = useState<{ q: string; a: string | null; failed?: boolean }[]>([]);
  const [question, setQuestion] = useState("");
  const cache = useRef(new Map<string, HintResponse>());

  const lines = [...p.lineTexts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, latex]) => ({ line, latex, status: p.statuses.get(line) }));
  const key = JSON.stringify([lines, p.firstWrong, lang]);

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
    } else if (r.mode === "next") {
      setSt({ kind: "next", key: k, hints: r.hints, shown: 1 });
      p.onFocusLine(null);
      p.setLog({ ...p.log, level1: p.log.level1 + 1 });
    }
  };

  const ask = async () => {
    // 같은 풀이 상태면 이미 받은 힌트를 다시 사용 (API 호출 절약)
    const cached = cache.current.get(key) ?? cacheGet<HintResponse>("hint:" + p.problem + key);
    if (cached) return show(cached, key);
    setSt({ kind: "loading" });
    try {
      const r = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: p.problem, problemKind: p.kind, lines, firstWrong: p.firstWrong, lang }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setSt({ kind: "fail", message: errMsg(d) });
      cache.current.set(key, d as HintResponse);
      cacheSet("hint:" + p.problem + key, d);
      show(d as HintResponse, key);
    } catch {
      setSt({ kind: "fail", message: t.netError });
    }
  };

  const sendQuestion = async (e?: React.FormEvent, text?: string) => {
    e?.preventDefault();
    const q = (text ?? question).trim();
    if (!q || qa.some((x) => x.a === null)) return;
    setQuestion("");
    const history = qa.filter((x) => x.a && !x.failed).slice(-3).map((x) => ({ q: x.q, a: x.a as string }));
    setQa((list) => [...list, { q, a: null }]);
    p.setLog({ ...p.log, questions: (p.log.questions ?? 0) + 1 });
    let answer = t.answerFail;
    let failed = true;
    try {
      const r = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: p.problem, problemKind: p.kind, lines, firstWrong: p.firstWrong, question: q, history, lang }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.mode === "answer") {
        answer = d.answer;
        failed = false;
      } else if (d.error) answer = errMsg(d);
    } catch {}
    setQa((list) => list.map((x, i) => (i === list.length - 1 ? { q, a: answer, failed } : x)));
  };

  // 음성 질문: 말하는 동안 입력칸에 글자가 채워지고, 말이 끝나면 바로 질문을 보냄
  const voice = useSpeech((text, final) => {
    setQuestion(text);
    if (final) void sendQuestion(undefined, text);
  }, lang);

  const solutionBox = (
    <SolutionView problem={p.problem} kind={p.kind} latex={p.latex} onView={() => p.setLog({ ...p.log, solutionViews: (p.log.solutionViews ?? 0) + 1 })} />
  );

  const askBox = (
    <div className="ask">
      {qa.length > 0 && (
        <ul className="ask-list">
          {qa.map((x, i) => (
            <li key={i}>
              <p className="ask-q">{x.q}</p>
              <p className={`ask-a ${x.a === null ? "hint-loading" : ""} ${x.failed ? "failed" : ""}`}>
                {x.a ? <MathText text={x.a} /> : t.answering}
                {x.a && !x.failed && (
                  <button type="button" className="speak-btn" onClick={() => speak(speakable(x.a as string, lang), lang)} aria-label={t.readAnswer}>
                    🔊
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={sendQuestion} className="ask-form">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder={voice.listening ? t.listening : t.askPlaceholder}
          aria-label={t.askLabel}
          enterKeyHint="send"
        />
        {voice.supported && (
          <button
            type="button"
            className={`mic-btn ${voice.listening ? "on" : ""}`}
            onClick={voice.listening ? voice.stop : voice.start}
            disabled={qa.some((x) => x.a === null)}
            aria-label={voice.listening ? t.micStop : t.micStart}
          >
            {voice.listening ? "■" : "🎤"}
          </button>
        )}
        <button type="submit" className="primary" disabled={!question.trim() || qa.some((x) => x.a === null) || voice.listening}>
          {t.askBtn}
        </button>
      </form>
      {voice.error && <p className="hint-sub ask-err">{voice.error === "denied" ? t.micDenied : voice.error === "no_speech" ? t.micNoSpeech : t.micFail}</p>}
    </div>
  );

  // ✓ 다 풀었어요: Claude가 풀이 전체(증명 포함)를 확인
  const review = async () => {
    setSt({ kind: "loading" });
    try {
      const r = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: p.problem, problemKind: p.kind, lines, firstWrong: p.firstWrong, review: true, lang }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.mode !== "review") return setSt({ kind: "fail", message: errMsg(d) });
      setSt({ kind: "review", correct: d.correct, feedback: d.feedback, line: d.line ?? null });
      p.onFocusLine(d.correct ? null : d.line ?? null);
      if (d.correct) p.onReviewedOk();
    } catch {
      setSt({ kind: "fail", message: t.netError });
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
        <div className="fab-stack">
          {p.kind === "free" && lines.length > 0 && (
            <button className="check-fab" onClick={review} disabled={p.checking}>
              {t.checkWork}
            </button>
          )}
          <button className="help-fab" onClick={ask} disabled={p.checking} aria-label={t.help}>
            {t.help}
          </button>
        </div>
      )}
      {st.kind !== "closed" && (
        <div className="hint-sheet" role="dialog" aria-label={t.help}>
          <button className="hint-close" onClick={close} aria-label={t.close}>✕</button>
          {st.kind === "loading" && <p className="hint-loading">{t.thinking}</p>}
          {st.kind === "review" && (
            <>
              <p className={st.correct ? "hint-fixed" : "hint-tag"}>{st.correct ? t.workCorrect : t.workNotYet}</p>
              {!st.correct && st.line !== null && <div className="hint-tag"><b>{t.lookAgain(st.line + 1)}</b></div>}
              <p className="hint-text"><MathText text={st.feedback} /></p>
              {!st.correct && solutionBox}
              {!st.correct && askBox}
            </>
          )}
          {st.kind === "fail" && (
            <>
              <p>{st.message}</p>
              <button className="primary" onClick={ask}>{t.askAgain}</button>
            </>
          )}
          {st.kind === "error" &&
            (st.fixed ? (
              <p className="hint-fixed">{t.fixed}</p>
            ) : (
              <>
                <div className="hint-tag">
                  <b>{t.lookAgain(st.line + 1)}</b>{t.lookAgainTail} · <span>{st.mistakeType}</span>
                </div>
                <p className="hint-text"><MathText text={st.message} /></p>
                <p className="hint-sub">{t.autoRecheck}</p>
                {solutionBox}
                {askBox}
              </>
            ))}
          {st.kind === "next" && (
            <>
              <ol className="hint-levels">
                {st.hints.slice(0, st.shown).map((h, i) => (
                  <li key={i}>
                    <span className="hint-lv">{t.hintLv(i + 1)} · {t.hintLabels[i]}</span>
                    <p className="hint-text"><MathText text={h} /></p>
                  </li>
                ))}
              </ol>
              {st.shown < 3 ? (
                <button className="ghost" onClick={more}>
                  {st.shown === 1 ? t.more1 : t.more2}
                </button>
              ) : (
                <p className="hint-sub">{t.tryNow}</p>
              )}
              {solutionBox}
              {askBox}
            </>
          )}
        </div>
      )}
    </>
  );
}
