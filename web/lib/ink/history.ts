import type { InkOp, InkState, Stroke } from "./types";

export const emptyInk: InkState = { strokes: [], undo: [], redo: [] };

function apply(strokes: Stroke[], op: InkOp): Stroke[] {
  if (op.kind === "add") return [...strokes, ...op.strokes];
  const ids = new Set(op.strokes.map((s) => s.id));
  return strokes.filter((s) => !ids.has(s.id));
}

function invert(op: InkOp): InkOp {
  return op.kind === "add" ? { kind: "erase", strokes: op.strokes } : { kind: "add", strokes: op.strokes };
}

export type InkAction =
  | { type: "do"; op: InkOp }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; strokes: Stroke[] };

export function inkReducer(state: InkState, action: InkAction): InkState {
  switch (action.type) {
    case "do":
      if (action.op.strokes.length === 0) return state;
      return {
        strokes: apply(state.strokes, action.op),
        undo: [...state.undo, action.op].slice(-200),
        redo: [],
      };
    case "undo": {
      const op = state.undo[state.undo.length - 1];
      if (!op) return state;
      return {
        strokes: apply(state.strokes, invert(op)),
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, op],
      };
    }
    case "redo": {
      const op = state.redo[state.redo.length - 1];
      if (!op) return state;
      return {
        strokes: apply(state.strokes, op),
        undo: [...state.undo, op],
        redo: state.redo.slice(0, -1),
      };
    }
    case "load":
      return { strokes: action.strokes, undo: [], redo: [] };
  }
}

/** 줄 번호 → 그 줄의 획 목록 (2단계에서 줄별 인식에 사용) */
export function groupByLine(strokes: Stroke[]): Map<number, Stroke[]> {
  const m = new Map<number, Stroke[]>();
  for (const s of strokes) {
    const arr = m.get(s.line) ?? [];
    arr.push(s);
    m.set(s.line, arr);
  }
  return m;
}
