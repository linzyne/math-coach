export type Point = { x: number; y: number; p: number };

export type Stroke = {
  id: string;
  points: Point[];
  /** 0부터 시작하는 줄 번호 (가로줄 기준) */
  line: number;
};

export type InkOp =
  | { kind: "add"; strokes: Stroke[] }
  | { kind: "erase"; strokes: Stroke[] };

export type InkState = {
  strokes: Stroke[];
  undo: InkOp[];
  redo: InkOp[];
};
