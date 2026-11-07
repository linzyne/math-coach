export type HintLog = { errorChecks: number; level1: number; level2: number; level3: number; questions?: number; solutionViews?: number };
export const emptyHintLog: HintLog = { errorChecks: 0, level1: 0, level2: 0, level3: 0, questions: 0, solutionViews: 0 };
/** 힌트 사용 횟수 (직접 질문은 따로 셈) */
export const hintTotal = (h: HintLog) => h.errorChecks + h.level1 + h.level2 + h.level3;
