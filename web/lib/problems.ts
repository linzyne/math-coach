export type LevelKey =
  | "basic" | "xBoth" | "paren" | "fracCoef" | "decimal" | "minusParen" | "fracEq"
  | "indSum" | "indDiv" | "indIneq" | "binExpand" | "binCoef" | "binConst";

export type Problem = {
  id: string;
  unit: "induction" | "linear";
  /** i18n 키 (lib/i18n.tsx 의 levels) */
  title: LevelKey;
  /** 화면에 보이는 문제 (글 + $수식$) */
  statement: string;
  /** solve: 방정식 풀기 (해 비교 검사) / free: 증명·이항정리 (줄마다 등식이 참인지 검사) */
  kind: "solve" | "free";
  /** solve 문제의 방정식 LaTeX */
  latex?: string;
  /** free 문제의 정답 판정: number(정답 숫자) / expand(전개식) / proof(Claude 확인) */
  answerType?: "number" | "expand" | "proof" | "other";
  answer?: string;
  level: 1 | 2 | 3;
};

const solve = (id: string, title: LevelKey, latex: string, level: 1 | 2 | 3): Problem => ({
  id, unit: "linear", title, statement: `$${latex}$`, kind: "solve", latex, level,
});

export const PROBLEMS: Problem[] = [
  // ---- Mathematical Induction & Binomial Theorem (IB AA HL)
  { id: "i01", unit: "induction", title: "indSum", level: 1, kind: "free", answerType: "proof",
    statement: "Prove by mathematical induction that $\\sum_{r=1}^{n} r = \\frac{n(n+1)}{2}$ for all $n \\in \\mathbb{Z}^+$." },
  { id: "i02", unit: "induction", title: "indSum", level: 1, kind: "free", answerType: "proof",
    statement: "Prove by mathematical induction that $\\sum_{r=1}^{n} (2r-1) = n^2$ for all $n \\in \\mathbb{Z}^+$." },
  { id: "i03", unit: "induction", title: "indSum", level: 2, kind: "free", answerType: "proof",
    statement: "Prove by mathematical induction that $\\sum_{r=1}^{n} r^2 = \\frac{n(n+1)(2n+1)}{6}$ for all $n \\in \\mathbb{Z}^+$." },
  { id: "i04", unit: "induction", title: "indSum", level: 2, kind: "free", answerType: "proof",
    statement: "Prove by mathematical induction that $\\sum_{r=1}^{n} \\frac{1}{r(r+1)} = \\frac{n}{n+1}$ for all $n \\in \\mathbb{Z}^+$." },
  { id: "i05", unit: "induction", title: "indDiv", level: 2, kind: "free", answerType: "proof",
    statement: "Prove by mathematical induction that $5^n - 1$ is divisible by $4$ for all $n \\in \\mathbb{Z}^+$." },
  { id: "i06", unit: "induction", title: "indIneq", level: 3, kind: "free", answerType: "proof",
    statement: "Prove by mathematical induction that $3^n > 2^n + n$ for all integers $n \\geq 2$." },
  { id: "b01", unit: "induction", title: "binExpand", level: 1, kind: "free", answerType: "expand", answer: "(2x-1)^4",
    statement: "Use the binomial theorem to expand $(2x - 1)^4$ fully." },
  { id: "b02", unit: "induction", title: "binCoef", level: 1, kind: "free", answerType: "number", answer: "720",
    statement: "Find the coefficient of $x^3$ in the expansion of $(3 + 2x)^5$." },
  { id: "b03", unit: "induction", title: "binConst", level: 2, kind: "free", answerType: "number", answer: "1120",
    statement: "Find the term independent of $x$ in the expansion of $\\left(2x - \\frac{1}{x}\\right)^{8}$." },
  { id: "b04", unit: "induction", title: "binCoef", level: 3, kind: "free", answerType: "number", answer: "40",
    statement: "Find the coefficient of $x^4$ in the expansion of $\\left(x^2 + \\frac{2}{x}\\right)^{5}$." },

  // ---- 일차방정식 (기존)
  solve("p01", "basic", "3x + 5 = 20", 1),
  solve("p02", "basic", "2x - 7 = 9", 1),
  solve("p03", "xBoth", "5x = 3x + 12", 1),
  solve("p04", "paren", "4(x - 2) = 2x + 6", 2),
  solve("p05", "paren", "3(2x + 1) - 4 = 5x + 6", 2),
  solve("p06", "fracCoef", "\\frac{x}{3} + 2 = 5", 2),
  solve("p07", "decimal", "0.3x - 1.2 = 0.1x + 0.4", 2),
  solve("p08", "minusParen", "2(3x - 1) - (x + 4) = 9", 3),
  solve("p09", "fracEq", "\\frac{x + 1}{2} = \\frac{x - 2}{3} + 2", 3),
  solve("p10", "fracEq", "\\frac{x}{2} - \\frac{x - 1}{3} = 1", 3),
];

/** 풀이 화면에 필요한 문제 정보 (샘플·직접 추가한 문제 공통) */
export type ProblemLike = Pick<Problem, "statement" | "kind" | "latex" | "answerType" | "answer">;

export const UNITS = ["induction", "linear"] as const;

export function getProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}
