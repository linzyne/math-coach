"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import InkCanvas, { type Tool } from "./InkCanvas";
import Toolbar from "./Toolbar";
import { emptyInk, groupByLine, inkReducer } from "@/lib/ink/history";
import { LINE_HEIGHT, TOP_MARGIN } from "@/lib/ink/geometry";
import type { Stroke } from "@/lib/ink/types";

const MIN_LINES = 10;

export default function SolveBoard({ problemId }: { problemId: string }) {
  const [ink, dispatch] = useReducer(inkReducer, emptyInk);
  const [tool, setTool] = useState<Tool>("pen");
  const [allowTouch, setAllowTouch] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
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
  const maxLine = ink.strokes.reduce((m, s) => Math.max(m, s.line), -1);
  const lineCount = Math.max(MIN_LINES, maxLine + 4);

  return (
    <div className="board">
      <Toolbar
        tool={tool}
        setTool={setTool}
        canUndo={ink.undo.length > 0}
        canRedo={ink.redo.length > 0}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onClear={() => dispatch({ type: "do", op: { kind: "erase", strokes: ink.strokes } })}
        allowTouch={allowTouch}
        setAllowTouch={setAllowTouch}
      />
      <div className="sheet-scroll" ref={scrollRef}>
        <div className="sheet" style={{ ["--line-h" as string]: `${LINE_HEIGHT}px`, ["--top" as string]: `${TOP_MARGIN}px` }}>
          <div className="gutter" aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i}
                className={`gutter-cell ${byLine.has(i) ? "has-ink" : ""} ${activeLine === i ? "active" : ""}`}
                style={{ height: LINE_HEIGHT }}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <div className="paper">
            <div className="lines" aria-hidden>
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
          </div>
          <div className="status-col" aria-live="polite">
            {Array.from({ length: lineCount }, (_, i) => {
              const n = byLine.get(i)?.length ?? 0;
              return (
                <div key={i} className="status-cell" style={{ height: LINE_HEIGHT }}>
                  {n > 0 ? <span className="stroke-count">획 {n}</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
