"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import InkCanvas, { type Tool } from "./InkCanvas";
import Toolbar from "./Toolbar";
import LineChip from "./LineChip";
import LineEditor from "./LineEditor";
import HintPanel from "./HintPanel";
import { emptyHintLog, hintTotal, type HintLog } from "@/lib/hintLog";
import { emptyInk, groupByLine, inkReducer } from "@/lib/ink/history";
import { LINE_HEIGHT, TOP_MARGIN } from "@/lib/ink/geometry";
import { useLineRecognition } from "@/lib/ink/useLineRecognition";
import { useVerify } from "@/lib/useVerify";
import type { Stroke } from "@/lib/ink/types";

const MIN_LINES = 10;

function usePersisted<T>(key: string, initial: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [key, value, ready]);
  return [value, setValue, ready];
}

type Props = { problemId: string; problemLatex: string; nextId: string | null };

export default function SolveBoard({ problemId, problemLatex, nextId }: Props) {
  const [ink, dispatch] = useReducer(inkReducer, emptyInk);
  const [tool, setTool] = useState<Tool>("pen");
  const [allowTouch, setAllowTouch] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [typed, setTyped] = usePersisted<Record<number, string>>(`typed:${problemId}`, {});
  const [hintLog, setHintLog] = usePersisted<HintLog>(`hints:${problemId}`, emptyHintLog);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `ink:${problemId}`;
  const loaded = useRef(false);

  // 새로고침해도 필기가 남도록 기기에 저장
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) dispatch({ type: "load", strokes: JSON.parse(raw) as Stroke[] });
    } catch {}
    loaded.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(ink.strokes));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [ink.strokes, storageKey]);

  const byLine = useMemo(() => groupByLine(ink.strokes), [ink.strokes]);
  const { results, noKey, retry } = useLineRecognition(byLine, activeLine);

  // 줄별 최종 텍스트: 키보드 입력 > 손글씨 인식
  const lineTexts = useMemo(() => {
    const m = new Map<number, string>();
    for (const [line, r] of results) if (r.status === "done" && r.latex && byLine.has(line)) m.set(line, r.latex);
    for (const [k, v] of Object.entries(typed)) m.set(Number(k), v);
    return m;
  }, [results, typed, byLine]);

  const verify = useVerify(problemLatex, lineTexts);

  const usedLines = [...byLine.keys(), ...Object.keys(typed).map(Number)];
  const maxLine = usedLines.reduce((m, l) => Math.max(m, l), -1);
  const lineCount = Math.max(MIN_LINES, maxLine + 4);

  const saveTyped = (line: number, text: string | null) => {
    const next = { ...typed };
    if (text) next[line] = text;
    else delete next[line];
    setTyped(next);
    setEditing(null);
  };

  const chipFor = (i: number) => <LineChip result={byLine.has(i) ? results.get(i) : undefined} typed={typed[i]} onRetry={() => retry(i)} />;

  return (
    <div className="board">
      <Toolbar
        tool={tool}
        setTool={setTool}
        canUndo={ink.undo.length > 0}
        canRedo={ink.redo.length > 0}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onClear={() => {
          dispatch({ type: "do", op: { kind: "erase", strokes: ink.strokes } });
          setTyped({});
        }}
        allowTouch={allowTouch}
        setAllowTouch={setAllowTouch}
      />
      {noKey && Object.keys(typed).length === 0 && (
        <div className="notice">
          손글씨 인식(Mathpix) 키가 아직 없어요. <b>왼쪽 줄 번호를 누르면 키보드로 식을 입력</b>해서 검사를 테스트할 수 있어요.
        </div>
      )}
      {verify.error && <div className="notice">{verify.error}</div>}
      {verify.solved && (
        <div className="praise" role="status">
          <span>
            정답이에요! {hintTotal(hintLog) === 0 ? "힌트 없이 스스로 끝까지 풀었어요 👏" : `힌트 ${hintTotal(hintLog)}번으로 끝까지 풀었어요 👏`}
          </span>
          {nextId ? (
            <Link href={`/solve/${nextId}`} className="primary">다음 문제 →</Link>
          ) : (
            <Link href="/" className="primary">목록으로</Link>
          )}
        </div>
      )}
      <div className="sheet-scroll" ref={scrollRef}>
        <div className="sheet" style={{ ["--line-h" as string]: `${LINE_HEIGHT}px`, ["--top" as string]: `${TOP_MARGIN}px` }}>
          <div className="gutter">
            {Array.from({ length: lineCount }, (_, i) => {
              const st = verify.statuses.get(i);
              const has = byLine.has(i) || typed[i] !== undefined;
              return (
                <button
                  key={i}
                  type="button"
                  className={`gutter-cell ${has ? "has-ink" : ""} ${activeLine === i ? "active" : ""} ${focusLine === i ? "focus" : ""}`}
                  style={{ height: LINE_HEIGHT }}
                  onClick={() => setEditing(i)}
                  aria-label={`${i + 1}번 줄 키보드로 입력${st === "wrong" ? " (다시 확인해 보세요)" : ""}`}
                >
                  {i + 1}
                  {st === "wrong" && <span className="wrong-dot" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="paper">
            <div className="lines" aria-hidden>
              {focusLine !== null && (
                <div className="focus-band" style={{ top: TOP_MARGIN + focusLine * LINE_HEIGHT, height: LINE_HEIGHT }} />
              )}
              {activeLine !== null && (
                <div className="active-band" style={{ top: TOP_MARGIN + activeLine * LINE_HEIGHT, height: LINE_HEIGHT }} />
              )}
            </div>
            <InkCanvas
              strokes={ink.strokes}
              dispatch={dispatch}
              tool={tool}
              allowTouch={allowTouch}
              lineCount={lineCount}
              scrollRef={scrollRef}
              onActiveLine={setActiveLine}
            />
            <div className="rec-layer">
              {/* 좁은 화면: 인식 결과를 줄 오른쪽 위에 겹쳐 표시 */}
              {Array.from({ length: lineCount }, (_, i) =>
                byLine.has(i) || typed[i] ? (
                  <div key={i} className="rec-overlay" style={{ top: TOP_MARGIN + i * LINE_HEIGHT + 4 }}>
                    {chipFor(i)}
                  </div>
                ) : null,
              )}
            </div>
          </div>
          <div className="status-col" aria-live="polite">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="status-cell" style={{ height: LINE_HEIGHT }} onClick={() => setEditing(i)}>
                {chipFor(i)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <HintPanel
        problem={problemLatex}
        lineTexts={lineTexts}
        statuses={verify.statuses}
        firstWrong={verify.firstWrong}
        checking={verify.checking}
        solved={verify.solved}
        log={hintLog}
        setLog={setHintLog}
        onFocusLine={setFocusLine}
      />
      {hintTotal(hintLog) > 0 && !verify.solved && <div className="hint-count">힌트 {hintTotal(hintLog)}회</div>}
      {editing !== null && (
        <LineEditor
          line={editing}
          initial={typed[editing] ?? ""}
          recognized={(() => {
            const r = results.get(editing);
            return r?.status === "done" ? r.latex : undefined;
          })()}
          onSave={(t) => saveTyped(editing, t)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
