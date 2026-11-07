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

/**
 * 기본 예제 문제. 지금은 비워 둠 (학생이 사진·붙여넣기로 직접 추가).
 * 예전 예제는 git 기록(커밋 0164c0a 이전)의 이 파일에 있음.
 */
export const PROBLEMS: Problem[] = [];

/** 풀이 화면에 필요한 문제 정보 (샘플·직접 추가한 문제 공통) */
export type ProblemLike = Pick<Problem, "statement" | "kind" | "latex" | "answerType" | "answer">;

export const UNITS = ["induction", "linear"] as const;

export function getProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}
