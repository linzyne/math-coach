"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ko";

const ko = {
  appTitle: "Math",
  appSub: "문제를 고르고 애플펜슬로 한 줄씩 풀어 보세요.",
  back: "← 목록",
  problemNo: (n: number) => `문제 ${n}`,
  writeTip: "한 줄에 한 단계씩 써 보세요",
  levels: { basic: "기본형", xBoth: "양변에 x", paren: "괄호", fracCoef: "분수 계수", decimal: "소수 계수", minusParen: "괄호 앞 마이너스", fracEq: "분수 방정식", indSum: "귀납법 · 합", indDiv: "귀납법 · 나누어떨어짐", indIneq: "귀납법 · 부등식", binExpand: "이항정리 · 전개", binCoef: "이항정리 · 계수", binConst: "이항정리 · 상수항" } as Record<string, string>,
  units: { induction: "수학적 귀납법 · 이항정리 (IB AA HL)", linear: "일차방정식" } as Record<string, string>,
  checkWork: "✓ 다 풀었어요, 확인해 줘요", checkingWork: "풀이 전체를 확인하는 중…", workCorrect: "완벽해요! 증명이 맞고 빠진 단계도 없어요 🎉", workNotYet: "거의 다 왔어요. 이 부분을 다시 볼까요?",
  writeTipFree: "한 줄에 한 단계씩, = 로 이어서 써 보세요",
  pen: "✏️ 펜", eraser: "🧽 지우개", undo: "↶ 되돌리기", redo: "↷ 다시", clearAll: "모두 지우기", fingerDraw: "손가락으로도 쓰기", tools: "필기 도구",
  noMathpix: "손글씨 인식(Mathpix) 키가 아직 없어요. 왼쪽 줄 번호를 누르면 키보드로 식을 입력해서 검사를 테스트할 수 있어요.",
  verifyNet: "검사 서버에 연결하지 못했어요.", verifyFail: "검사하지 못했어요.",
  recPending: "인식 중…", recFail: "인식 실패", recNet: "네트워크 오류", retry: "다시", noKeyRec: "Mathpix 키가 설정되지 않았어요.",
  praiseSolution: "풀이를 보고 끝까지 직접 써 봤어요. 다음엔 풀이 없이 도전해 봐요 💪",
  praiseNoHint: "힌트 없이 스스로 끝까지 풀었어요 👏",
  praiseHints: (n: number) => `힌트 ${n}번으로 끝까지 풀었어요 👏`,
  correct: "정답이에요!", next: "다음 문제 →", toList: "목록으로",
  hintCount: (h: number, q: number, sol: boolean) => `힌트 ${h}회${q ? ` · 질문 ${q}회` : ""}${sol ? " · 풀이 봄" : ""}`,
  lineInput: (n: number) => `${n}번 줄 입력`, lineLabel: (n: number) => `${n}번 줄 키보드로 입력`, linePlaceholder: "이 줄의 식", preview: "미리보기",
  example: "예:", useRecognized: "손글씨 인식 결과 쓰기:", clearInput: "입력 지우기", cancel: "취소", ok: "확인", checkAgain: " (다시 확인해 보세요)",
  help: "🙋 도움 요청", close: "닫기", thinking: "어디서 막혔는지 살펴보는 중…", askAgain: "다시 요청",
  fixed: "잘 고쳤어요! 👍 계속 풀어 보세요.", lookAgain: (n: number) => `${n}번 줄`, lookAgainTail: "을 다시 볼까요?",
  autoRecheck: "그 줄을 고치면 자동으로 다시 검사해요.", hintLv: (i: number) => `힌트 ${i}`, hintLabels: ["방향", "구체적으로", "다음 줄"],
  more1: "조금 더 알려줘요 (2/3)", more2: "다음 줄을 보여줘요 (3/3)", tryNow: "이제 직접 써 보세요!",
  askPlaceholder: "그래도 모르겠으면 직접 물어보세요", listening: "듣고 있어요… 말해 보세요", askBtn: "질문", askLabel: "직접 질문하기",
  micStart: "말로 질문하기", micStop: "음성 입력 멈추기", answering: "생각하는 중…", answerFail: "답을 받지 못했어요. 다시 물어봐 주세요.", readAnswer: "답변 읽어주기",
  micDenied: "마이크 권한을 허용해 주세요.", micNoSpeech: "목소리가 들리지 않았어요.", micFail: "음성 인식에 실패했어요.",
  netError: "네트워크 오류예요. 다시 눌러 주세요.", hintFail: "힌트를 받지 못했어요.",
  apiErrors: { no_key: "Claude API 키가 없거나 형식이 달라요. Vercel의 ANTHROPIC_API_KEY 값을 확인해 주세요.", bad_key: "Claude API 키가 올바르지 않아요.", rate_limit: "잠시 후 다시 눌러 주세요.", no_hint: "힌트를 만들지 못했어요. 다시 눌러 주세요.", parse: "답 형식을 읽지 못했어요. 다시 눌러 주세요.", api: "힌트 서버에 문제가 있어요.", unknown: "힌트를 만들지 못했어요.", bad_request: "요청이 올바르지 않아요." } as Record<string, string>,
  solOpen: "📖 풀이 보기", solReopen: "📖 풀이 다시 보기", solConfirm: "스스로 풀면 더 오래 기억나요. 그래도 풀이를 볼까요?", solMore: "조금 더 해볼게요", solYes: "풀이 볼래요",
  solLoading: "풀이를 만들고 확인하는 중…", solFail: "정확한 풀이를 만들지 못했어요. 다시 눌러 주세요.", solTry: "다시 시도", solTitle: "정답 풀이",
  legendX: "x 항", legendXTail: " 파란색", legendArrow: "화살표 양옆 = 양변에 똑같이 한 계산", problem: "문제", nextStep: "다음 단계",
  solAfter: "풀이를 본 뒤에는 창을 닫고 직접 다시 써 보세요. ✍️", readAll: "🔊 처음부터 읽어주기", stopRead: "■ 그만 읽기", tapCard: "카드를 누르면 그 단계만 읽어줘요",
  kinds: { "괄호 풀기": "괄호 풀기", "분모 없애기": "분모 없애기", 이항: "이항", "동류항 정리": "동류항 정리", "양변 나누기": "양변 나누기", 약분: "약분", 기타: "기타", "기본 단계": "기본 단계", "귀납 가정": "귀납 가정", "귀납 단계": "귀납 단계", "식 정리": "식 정리", 결론: "결론", 일반항: "일반항", "지수 정리": "지수 정리", "계수 계산": "계수 계산", 전개: "전개", "방정식 풀기": "방정식 풀기" } as Record<string, string>,
  sayProblem: "문제.", sayAnswer: "답.", sayStep: (i: number) => `${i}단계.`,
  addProblem: "＋ 문제 추가", emptyList: "아직 문제가 없어요. 위의 ＋ 문제 추가를 눌러 문제집 사진을 찍거나, 문제를 붙여넣어 보세요.", myProblems: "내가 추가한 문제", samples: "샘플 문제", del: "삭제", delConfirm: "이 문제를 지울까요?",
  addTitle: "문제 추가", tabPhoto: "📷 사진", tabPaste: "📋 붙여넣기 / 입력",
  photoHelp: "문제집이나 학습지를 찍거나 사진을 고르세요. 사진 속 방정식을 찾아 드려요.", choosePhoto: "사진 찍기 / 고르기", pasteImage: "📋 복사한 사진 붙여넣기", pasteTip: "복사한 사진은 붙여넣기(⌘V)나 끌어다 놓기로도 올릴 수 있어요.", noImageInClipboard: "클립보드에 사진이 없어요. 사진을 먼저 복사해 주세요.", reading: "사진에서 문제를 찾는 중…",
  noneFound: "사진에서 방정식을 찾지 못했어요. 더 가까이, 밝게 찍어 보세요.",
  pasteHelp: "한 줄에 문제 하나씩 붙여넣거나 입력하세요. 번호는 알아서 지워요.", pastePlaceholder: "3x + 5 = 20\n2(x - 1) = x + 4", findProblems: "문제 찾기",
  review: "추가할 문제를 확인하고 고쳐 주세요", checking: "확인 중…", okSol: "방정식 · 줄마다 자동 검사", okFree: "증명·서술형 · 줄마다 등식 검사 + Claude 최종 확인",
  reasons: { parse: "식을 읽을 수 없어요", not_linear: "아직 일차방정식만 지원해요", no_unique: "해가 하나가 아니에요", not_equation: "부등식·증명 문제는 아직 지원하지 않아요 (일차방정식만)" } as Record<string, string>,
  backStep: "← 뒤로",
  addN: (n: number) => `${n}문제 추가`, added: (n: number) => `${n}문제를 추가했어요`,
  mathKbHelp: "아래 수식 키보드로 입력하세요. 분수·Σ·nCr 버튼을 누르면 칸이 생겨요.", useRaw: "LaTeX로 직접 입력", useMathKb: "수식 키보드로 입력",
  why: "💡 왜?", hideWhy: "접기", expandAll: "💡 모두 펼치기", collapseAll: "모두 접기", sayWhy: "왜냐하면,",
};

export type Dict = typeof ko;

const en: Dict = {
  appTitle: "Math",
  appSub: "Pick a problem and solve it one line at a time with your Apple Pencil.",
  back: "← List",
  problemNo: (n: number) => `Problem ${n}`,
  writeTip: "Write one step per line",
  levels: { basic: "Basic", xBoth: "x on both sides", paren: "Brackets", fracCoef: "Fractions", decimal: "Decimals", minusParen: "Minus before brackets", fracEq: "Fraction equation", indSum: "Induction · sums", indDiv: "Induction · divisibility", indIneq: "Induction · inequality", binExpand: "Binomial · expand", binCoef: "Binomial · coefficient", binConst: "Binomial · constant term" },
  units: { induction: "Mathematical Induction & Binomial Theorem (IB AA HL)", linear: "Linear equations" },
  checkWork: "✓ I'm done — check my work", checkingWork: "Checking your whole solution…", workCorrect: "Perfect! Your proof is correct and complete 🎉", workNotYet: "Almost there. Take another look at this:",
  writeTipFree: "One step per line — start a line with = to continue",
  pen: "✏️ Pen", eraser: "🧽 Eraser", undo: "↶ Undo", redo: "↷ Redo", clearAll: "Clear all", fingerDraw: "Draw with finger", tools: "Drawing tools",
  noMathpix: "Handwriting recognition (Mathpix) isn't set up yet. Tap a line number on the left to type the equation and test the checking.",
  verifyNet: "Couldn't reach the checking server.", verifyFail: "Couldn't check your work.",
  recPending: "Reading…", recFail: "Couldn't read", recNet: "Network error", retry: "retry", noKeyRec: "Mathpix key isn't set.",
  praiseSolution: "You looked at the solution and wrote it all out yourself. Next time, try it without the solution 💪",
  praiseNoHint: "You solved it all by yourself, no hints! 👏",
  praiseHints: (n: number) => `You finished it with ${n} hint${n === 1 ? "" : "s"} 👏`,
  correct: "Correct!", next: "Next problem →", toList: "Back to list",
  hintCount: (h: number, q: number, sol: boolean) => `Hints ${h}${q ? ` · Questions ${q}` : ""}${sol ? " · Saw solution" : ""}`,
  lineInput: (n: number) => `Line ${n}`, lineLabel: (n: number) => `Type line ${n} with keyboard`, linePlaceholder: "Equation for this line", preview: "Preview",
  example: "e.g.", useRecognized: "Use handwriting result:", clearInput: "Clear", cancel: "Cancel", ok: "OK", checkAgain: " (take another look)",
  help: "🙋 Help", close: "Close", thinking: "Looking at where you got stuck…", askAgain: "Try again",
  fixed: "Nice fix! 👍 Keep going.", lookAgain: (n: number) => `Line ${n}`, lookAgainTail: " — take another look?",
  autoRecheck: "When you fix that line, it's checked again automatically.", hintLv: (i: number) => `Hint ${i}`, hintLabels: ["Direction", "Specific", "Next line"],
  more1: "Tell me a bit more (2/3)", more2: "Show me the next line (3/3)", tryNow: "Now try writing it yourself!",
  askPlaceholder: "Still stuck? Ask your own question", listening: "Listening… go ahead", askBtn: "Ask", askLabel: "Ask a question",
  micStart: "Ask by voice", micStop: "Stop voice input", answering: "Thinking…", answerFail: "Couldn't get an answer. Please ask again.", readAnswer: "Read answer aloud",
  micDenied: "Please allow microphone access.", micNoSpeech: "I didn't hear anything.", micFail: "Voice recognition failed.",
  netError: "Network error. Please tap again.", hintFail: "Couldn't get a hint.",
  apiErrors: { no_key: "Claude API key is missing or malformed. Check ANTHROPIC_API_KEY in Vercel.", bad_key: "Claude API key is invalid.", rate_limit: "Please wait a moment and tap again.", no_hint: "Couldn't make a hint. Please tap again.", parse: "Couldn't read the reply. Please tap again.", api: "The hint server had a problem.", unknown: "Couldn't make a hint.", bad_request: "Invalid request." },
  solOpen: "📖 Show solution", solReopen: "📖 Show solution again", solConfirm: "You'll remember it longer if you solve it yourself. Still want to see the solution?", solMore: "I'll keep trying", solYes: "Show me",
  solLoading: "Making and checking the solution…", solFail: "Couldn't make an accurate solution. Please tap again.", solTry: "Try again", solTitle: "Solution",
  legendX: "x terms", legendXTail: " in blue", legendArrow: "Both sides of an arrow = the same operation on both sides", problem: "Problem", nextStep: "Next step",
  solAfter: "After reading, close this and write it out yourself. ✍️", readAll: "🔊 Read it to me", stopRead: "■ Stop", tapCard: "Tap a card to hear just that step",
  kinds: { "괄호 풀기": "Expand brackets", "분모 없애기": "Clear fractions", 이항: "Move terms", "동류항 정리": "Combine like terms", "양변 나누기": "Divide both sides", 약분: "Simplify", 기타: "Other", "기본 단계": "Base case", "귀납 가정": "Assumption", "귀납 단계": "Inductive step", "식 정리": "Simplify", 결론: "Conclusion", 일반항: "General term", "지수 정리": "Powers", "계수 계산": "Coefficient", 전개: "Expand", "방정식 풀기": "Solve" },
  sayProblem: "Problem.", sayAnswer: "Answer.", sayStep: (i: number) => `Step ${i}.`,
  addProblem: "＋ Add problem", emptyList: "No problems yet. Tap ＋ Add problem above to take a photo of your worksheet or paste a question.", myProblems: "My problems", samples: "Sample problems", del: "Delete", delConfirm: "Delete this problem?",
  addTitle: "Add a problem", tabPhoto: "📷 Photo", tabPaste: "📋 Paste / type",
  photoHelp: "Take a photo of your worksheet or textbook, or choose one. I'll find the equations in it.", choosePhoto: "Take / choose photo", pasteImage: "📋 Paste copied image", pasteTip: "You can also paste a copied image (⌘V) or drag and drop it here.", noImageInClipboard: "No image on the clipboard. Copy an image first.", reading: "Finding problems in the photo…",
  noneFound: "Couldn't find any equations. Try a closer, brighter photo.",
  pasteHelp: "Paste or type one problem per line. Numbers like 1) are removed automatically.", pastePlaceholder: "3x + 5 = 20\n2(x - 1) = x + 4", findProblems: "Find problems",
  review: "Check the problems before adding (you can edit them)", checking: "Checking…", okSol: "Equation · every line auto-checked", okFree: "Proof / written answer · equations checked + final check by Claude",
  reasons: { parse: "Can't read this equation", not_linear: "Only linear equations for now", no_unique: "Doesn't have exactly one solution", not_equation: "Inequalities and proofs aren't supported yet (linear equations only)" },
  backStep: "← Back",
  addN: (n: number) => `Add ${n} problem${n === 1 ? "" : "s"}`, added: (n: number) => `Added ${n} problem${n === 1 ? "" : "s"}`,
  mathKbHelp: "Use the maths keyboard below. Fraction, Σ and nCr keys add boxes to fill in.", useRaw: "Type LaTeX instead", useMathKb: "Use maths keyboard",
  why: "💡 Why?", hideWhy: "Hide", expandAll: "💡 Show all whys", collapseAll: "Hide all", sayWhy: "Why?",
};

const DICTS: Record<Lang, Dict> = { en, ko };

const Ctx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({ lang: "en", t: en, setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "en" || saved === "ko") setLangState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
  };
  return <Ctx.Provider value={{ lang, t: DICTS[lang], setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="seg lang-toggle" role="group" aria-label="Language">
      <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} aria-pressed={lang === "en"}>EN</button>
      <button className={lang === "ko" ? "on" : ""} onClick={() => setLang("ko")} aria-pressed={lang === "ko"}>한</button>
    </div>
  );
}
