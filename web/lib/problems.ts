export type Problem = {
  id: string;
  /** i18n 키 (lib/i18n.tsx 의 levels) */
  title: "basic" | "xBoth" | "paren" | "fracCoef" | "decimal" | "minusParen" | "fracEq";
  /** 화면 표시 및 검증용 LaTeX */
  latex: string;
  answer: string;
  level: 1 | 2 | 3;
};

export const PROBLEMS: Problem[] = [
  { id: "p01", title: "basic", latex: "3x + 5 = 20", answer: "x = 5", level: 1 },
  { id: "p02", title: "basic", latex: "2x - 7 = 9", answer: "x = 8", level: 1 },
  { id: "p03", title: "xBoth", latex: "5x = 3x + 12", answer: "x = 6", level: 1 },
  { id: "p04", title: "paren", latex: "4(x - 2) = 2x + 6", answer: "x = 7", level: 2 },
  { id: "p05", title: "paren", latex: "3(2x + 1) - 4 = 5x + 6", answer: "x = 7", level: 2 },
  { id: "p06", title: "fracCoef", latex: "\\frac{x}{3} + 2 = 5", answer: "x = 9", level: 2 },
  { id: "p07", title: "decimal", latex: "0.3x - 1.2 = 0.1x + 0.4", answer: "x = 8", level: 2 },
  { id: "p08", title: "minusParen", latex: "2(3x - 1) - (x + 4) = 9", answer: "x = 3", level: 3 },
  { id: "p09", title: "fracEq", latex: "\\frac{x + 1}{2} = \\frac{x - 2}{3} + 2", answer: "x = 5", level: 3 },
  { id: "p10", title: "fracEq", latex: "\\frac{x}{2} - \\frac{x - 1}{3} = 1", answer: "x = 4", level: 3 },
];

export function getProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}
