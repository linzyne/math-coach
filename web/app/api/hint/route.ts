import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type LineIn = { line: number; latex: string; status?: "ok" | "wrong" | "unparsed" };
type QA = { q: string; a: string };
type Body = {
  problem: string;
  /** solve: 중학교 일차방정식 / free: IB AA HL 증명·이항정리 등 */
  problemKind?: "solve" | "free";
  lines: LineIn[];
  firstWrong: number | null;
  question?: string;
  history?: QA[];
  solution?: boolean;
  /** ✓ 다 풀었어요: 풀이 전체 확인 */
  review?: boolean;
  /** 풀이의 한 단계를 더 깊게 설명 (💡 More) */
  explainStep?: number;
  steps?: { latex: string; explain: string; why?: string }[];
  lang?: "en" | "ko";
};

export type HintResponse =
  | { mode: "error"; line: number; mistakeType: string; message: string }
  | { mode: "next"; hints: [string, string, string] }
  | { mode: "answer"; answer: string }
  | { mode: "solution"; steps: SolutionStep[] }
  | { mode: "review"; correct: boolean; line: number | null; feedback: string }
  | { mode: "more"; more: string };

const SOLVE_KINDS = ["괄호 풀기", "분모 없애기", "이항", "동류항 정리", "양변 나누기", "약분", "기타"] as const;
const FREE_KINDS = ["기본 단계", "귀납 가정", "귀납 단계", "식 정리", "결론", "일반항", "지수 정리", "계수 계산", "전개", "방정식 풀기", "기타"] as const;
export const STEP_KINDS = [...SOLVE_KINDS, ...FREE_KINDS.filter((k) => k !== "기타")] as const;
export type SolutionStep = { latex: string; explain: string; why?: string; tip?: string; kind?: string; op?: string };

const MISTAKES = {
  solve: {
    ko: ["부호 실수", "이항 실수", "분배법칙 실수", "계산 실수", "분모 처리 실수", "소수 처리 실수", "식 옮겨 쓰기 실수", "기타"],
    en: ["Sign error", "Moving terms error", "Expanding brackets error", "Arithmetic error", "Fraction error", "Decimal error", "Copying error", "Other"],
  },
  free: {
    ko: ["식 변형 실수", "계산 실수", "부호 실수", "지수 계산 실수", "이항계수 실수", "기본 단계 문제", "귀납 가정을 쓰지 않음", "결론 문장 빠짐", "기타"],
    en: ["Algebra error", "Arithmetic error", "Sign error", "Index (power) error", "Binomial coefficient error", "Base case problem", "Inductive hypothesis not used", "Missing conclusion", "Other"],
  },
};

/** 영어 모드: 학생이 영어 모국어 화자 */
const EN_RULE = `
[Language] The student's first language is English. Write every student-facing sentence (message, hint1~3, answer, explain, why, tip, more, feedback) in simple, natural English only.
- Never use Korean words or Korean in parentheses. Use standard English math terms.
- Keep it short and warm. Refer to lines as "Line 2".`;

const SYSTEM_BASE = `너는 학생의 수학 풀이를 돕는 다정한 수학 코치야.
가장 중요한 원칙: 학생이 스스로 고치고 스스로 풀게 한다. 정답이나 고친 식을 먼저 알려주지 않는다.
- 짧고 따뜻하게. 한두 문장.
- 학생 풀이의 줄 번호는 사람이 읽는 번호(1부터)로 말한다.
- 학생에게 보이는 글 속의 수식은 $...$ 로 감싼 LaTeX로 쓴다. 예: $4x - 8 = 2x + 6$, $\\sum_{r=1}^{k} r$, $\\binom{8}{4}$`;

const LEVEL = {
  solve: `
[학생 수준] 중학생, 일차방정식 단원. 말투는 중학생에게 말하듯 쉬운 존댓말(~해요).`,
  free: `
[학생 수준] IB Mathematics: Analysis and Approaches HL, 11학년. 단원: 수학적 귀납법(Mathematical Induction), 이항정리(Binomial Theorem) 등.
- 증명은 IB 채점 방식을 따른다: 기본 단계(n=1 등) 확인 → P(k)가 참이라고 가정 → 가정을 사용해 P(k+1) 유도 → 결론 문장("Since P(1) is true and P(k) true implies P(k+1) true, P(n) is true for all n by induction").
- 이항정리는 일반항 $T_{r+1} = \\binom{n}{r} a^{n-r} b^r$ 을 중심으로 생각한다.`,
};

function fmtLines(lines: LineIn[]) {
  if (lines.length === 0) return "(아직 아무것도 쓰지 않음)";
  return lines.map((l) => `${l.line + 1}번 줄: ${l.latex}${l.status === "unparsed" ? "  (자동 검사로 판단 못 함)" : ""}`).join("\n");
}

function errorPrompt(b: Body, wrong: LineIn, free: boolean) {
  const prev = b.lines.filter((l) => l.line < wrong.line && l.status === "ok").pop();
  return `문제: ${b.problem}

학생 풀이:
${fmtLines(b.lines)}

자동 검사 결과, 처음으로 틀린 줄은 ${wrong.line + 1}번 줄이에요.${free ? " (이 줄의 등식이나 계산이 성립하지 않아요.)" : ` (바로 앞의 맞은 식: ${prev ? prev.latex : b.problem})`}
이 줄에서 어떤 종류의 실수를 했는지 골라 주고, 학생이 그 줄을 다시 살펴보게 하는 짧은 말을 써 줘.
- 틀린 위치(어느 부분/어느 항을 보면 되는지)와 실수 종류만 알려준다.
- 올바른 식, 올바른 숫자, 최종 답은 절대 쓰지 않는다.`;
}

function nextPrompt(b: Body, free: boolean) {
  return `문제: ${b.problem}

학생 풀이 (자동 검사로 찾은 틀린 줄 없음):
${fmtLines(b.lines)}

학생이 다음 한 줄에서 막혔어요. 바로 다음 한 단계에 대한 힌트를 3단계로 써 줘.
- hint1 (방향만): 무엇을 하면 좋을지 방향만. 구체적인 숫자나 식은 쓰지 않는다.
- hint2 (구체적 행동): 무엇을 어떻게 하면 되는지 구체적으로. 하지만 결과 식은 쓰지 않는다.
- hint3 (그 줄 풀이): 바로 다음 한 줄만 보여준다${free ? " (증명이면 다음 한 문장이나 식 한 줄)" : ""}. 그 뒤의 단계나 최종 답까지 가지 않는다.
  (다음 한 줄이 곧 최종 답이라면 보여줘도 된다.)`;
}

function askPrompt(b: Body, question: string) {
  const past = (b.history ?? []).map((h) => `학생: ${h.q}\n코치: ${h.a}`).join("\n");
  return `문제: ${b.problem}

학생 풀이:
${fmtLines(b.lines)}
${b.firstWrong !== null ? `(자동 검사: ${b.firstWrong + 1}번 줄부터 틀림)` : "(자동 검사: 지금까지 틀린 줄 없음)"}
${past ? `\n앞선 대화:\n${past}\n` : ""}
학생의 질문: ${question}

이 질문에 답해 줘. 규칙:
- 개념은 쉽게 설명해도 된다. 예시가 필요하면 이 문제와 다른 숫자로 든다.
- 이 문제의 최종 답이나 남은 풀이 전체는 알려주지 않는다. 답을 바로 달라고 하면 부드럽게 거절하고, 스스로 생각해 볼 수 있는 질문이나 다음 행동 하나를 제안한다.
- 수학이나 이 문제와 상관없는 질문이면 짧게 받아주고 문제로 돌아오게 한다.
- 3문장 이내.`;
}

function solutionPrompt(b: Body, free: boolean) {
  if (!free) {
    return `문제: ${b.problem}

이 일차방정식의 정답 풀이를 중학교 교과서 방식으로 처음부터 끝까지 써 줘.
- steps의 각 항목은 한 줄(한 단계)의 식이다. 첫 줄은 문제를 변형한 첫 단계부터 시작하고, 마지막 줄은 반드시 'x = 값' 꼴로 끝낸다.
- latex: 그 줄의 식을 LaTeX로 ($ 없이). 등호는 하나만. 분수는 \\frac{}{} 사용.
- explain: 그 줄에서 무엇을 했는지 한 문장 (예: "양변에서 5를 빼요.").
- kind: 그 줄에서 한 동작의 종류 (언어와 상관없이 아래 한국어 값 중 하나). 괄호 풀기 / 분모 없애기(양변에 수를 곱함) / 이항(항을 반대편으로 옮김, 양변에 더하거나 뺌) / 동류항 정리 / 양변 나누기 / 약분 / 기타
- why: 이 단계의 '왜'를 설명한다. explain(무엇을 했는지)을 다시 말하지 않는다. 다음 중 이 단계에 가장 중요한 것 하나를 1~2문장으로:
  · 왜 하필 이렇게 하는지 (목표에서 거꾸로 생각한 이유) / 안 하면 무엇이 막히는지
  · 왜 이렇게 해도 되는지 (어떤 성질·규칙 때문인지)
  · 학생들이 이 단계에서 흔히 하는 오해나 실수
  같은 비유나 같은 말을 여러 단계에서 반복하지 않는다. 숫자 계산만 하는 당연한 단계는 빈 문자열("")로 둔다. 수식은 $...$ 로 감싼다.
  (참고할 개념: 등식의 성질과 저울, 분배법칙, 이항하면 부호가 바뀌는 이유, 목표는 x만 남기기. 중학생 눈높이로.)
- tip: 빈 문자열.
- op: 양변에 한 연산을 짧게. 예: "×6", "−5", "+2x", "÷2". 양변 연산이 아니면 빈 문자열.
- 한 줄에 한 가지 일만 한다. 보통 3~6줄.`;
  }
  return `문제: ${b.problem}

IB AA HL 모범 답안처럼 처음부터 끝까지 풀어 줘.
- steps의 각 항목은 답안의 한 줄이다. 증명이면 기본 단계 → 가정 → 귀납 단계(식 변형 여러 줄) → 결론 순서.
- latex: 그 줄 전체를 LaTeX로 ($ 없이). 글은 \\text{...} 안에 쓴다. 예: \\text{When } n = 1: \\text{ LHS} = 1, \\text{ RHS} = \\frac{1(2)}{2} = 1
  · 식 변형은 등호로 이어 쓰고, 이전 줄에서 이어지는 줄은 "= ..." 로 시작해도 된다. 모든 등식과 계산은 실제로 성립해야 한다 (자동 검사기가 확인함).
  · 합은 \\sum_{r=1}^{k}, 이항계수는 \\binom{n}{r}, 분수는 \\frac{}{} 사용.
- explain: 그 줄에서 무엇을 했는지 한 문장. 문장 속 수식은 반드시 $...$ 로 감싼다 (예: "Write $3^{k+1}$ as $3 \\cdot 3^k$.").
- kind: 그 줄의 역할 (언어와 상관없이 아래 한국어 값 중 하나). 기본 단계 / 귀납 가정 / 귀납 단계 / 식 정리 / 결론 / 일반항 / 지수 정리 / 계수 계산 / 전개 / 방정식 풀기 / 기타
- why: 이 단계의 '왜'를 설명한다. explain(무엇을 했는지)을 다시 말하지 않는다. 다음 중 이 단계에 가장 중요한 것 하나를 1~2문장으로:
  · 왜 하필 이렇게 하는지 (목표에서 거꾸로 생각한 이유) / 안 하면 무엇이 막히는지
  · 왜 이렇게 해도 되는지 (어떤 성질·규칙 때문인지)
  · 학생들이 이 단계에서 흔히 하는 오해나 실수
  같은 비유나 같은 말을 여러 단계에서 반복하지 않는다. 숫자 계산만 하는 당연한 단계는 빈 문자열("")로 둔다. 수식은 $...$ 로 감싼다.
  (귀납법에서 꼭 짚을 것: 가정 단계에서는 "P(k)가 참이라고 주장하는 게 아니라 'P(k)이면 P(k+1)'이라는 연결을 증명하는 것이라 순환논리가 아니다"; 부등식 증명에서는 부등식을 이어 붙이는 논리(A > B > C 이므로 A > C); n ≥ 10 같은 조건이 실제로 어디서 필요한지(대개 기본 단계); 귀납 단계에서 가정을 정확히 어디서 썼는지.)
- tip: IB 채점에서 점수가 걸린 단계에만 짧은 시험 팁 한 문장 (예: 결론 문장을 빠뜨리면 마지막 점수를 잃는다, 가정을 쓴 곳을 'by the assumption'으로 표시하라, 기본 단계는 LHS와 RHS를 따로 계산해 보여라). 그 밖의 단계는 빈 문자열.
- op: 빈 문자열.
- 보통 5~9줄.`;
}

function morePrompt(b: Body, idx: number) {
  const steps = (b.steps ?? []).map((s, i) => `${i + 1}. ${s.latex}  — ${s.explain}`).join("\n");
  return `문제: ${b.problem}

모범 풀이:
${steps}

학생이 ${idx + 1}번 단계를 더 자세히 알고 싶어 해요. 이 단계를 깊게 설명해 줘.
- 왜 이 단계가 필요한지, 왜 이렇게 해도 되는지 (근거가 되는 성질·논리).
- 학생들이 여기서 흔히 헷갈리는 점 하나와 그 오해를 푸는 설명.
- 이 문제와 다른 숫자로 든 짧은 예시나 반례 하나.
- 3~6문장. 수식은 $...$ 로 감싼다. 문단을 나눌 때는 빈 줄을 쓴다.`;
}

const MORE_SCHEMA = {
  type: "object",
  properties: { more: { type: "string" } },
  required: ["more"],
  additionalProperties: false,
};

function reviewPrompt(b: Body) {
  return `문제: ${b.problem}

학생 풀이:
${fmtLines(b.lines)}

학생이 "다 풀었어요"라고 했어요. 풀이 전체가 맞고 완전한지 IB 채점 기준으로 판단해 줘.
- correct: 수학적으로 맞고 빠진 필수 단계가 없으면 true. (증명은 기본 단계, 가정, 가정을 사용한 귀납 단계, 결론 문장이 모두 있어야 함. 계산 문제는 최종 답이 맞아야 함.) 손글씨 인식 때문에 생긴 사소한 표기 차이는 봐준다.
- line: correct가 false면 가장 먼저 고쳐야 할 줄 번호(1부터). 빠진 단계라서 특정 줄이 없으면 0. correct가 true면 0.
- feedback: correct면 잘한 점을 짧게 칭찬. 아니면 무엇이 빠졌거나 어디를 다시 볼지만 짧게 알려준다. 올바른 식이나 답은 쓰지 않는다. 2문장 이내.`;
}

const solutionSchema = (free: boolean) => ({
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          latex: { type: "string" },
          explain: { type: "string" },
          why: { type: "string" },
          tip: { type: "string" },
          kind: { type: "string", enum: free ? [...FREE_KINDS] : [...SOLVE_KINDS] },
          op: { type: "string" },
        },
        required: ["latex", "explain", "why", "tip", "kind", "op"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
});

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: { correct: { type: "boolean" }, line: { type: "integer" }, feedback: { type: "string" } },
  required: ["correct", "line", "feedback"],
  additionalProperties: false,
};

const errorSchema = (free: boolean, en: boolean) => ({
  type: "object",
  properties: {
    mistake_type: { type: "string", enum: MISTAKES[free ? "free" : "solve"][en ? "en" : "ko"] },
    message: { type: "string" },
  },
  required: ["mistake_type", "message"],
  additionalProperties: false,
});

const NEXT_SCHEMA = {
  type: "object",
  properties: { hint1: { type: "string" }, hint2: { type: "string" }, hint3: { type: "string" } },
  required: ["hint1", "hint2", "hint3"],
  additionalProperties: false,
};

let client: Anthropic | null = null;

/** 환경변수에 예시 코드 등이 같이 붙여넣어져도 키 부분만 꺼내 쓴다 */
function readApiKey(): string | null {
  const raw = process.env.ANTHROPIC_API_KEY ?? "";
  const m = raw.match(/sk-ant-[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}

/** 진단용: 키 같은 비밀 문자열이 섞이지 않게 잘라서 보여줌 */
function shortMsg(m?: string) {
  return (m ?? "").replace(/sk-ant-[\w-]+/g, "[key]").slice(0, 160);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(text: string): Record<string, any> | null {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  for (const cand of [t, t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)]) {
    try {
      const v = JSON.parse(cand);
      if (v && typeof v === "object") return v;
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  const apiKey = readApiKey();
  if (!apiKey) return NextResponse.json({ error: "no_key" }, { status: 503 });
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof b?.problem !== "string" || !Array.isArray(b.lines) || b.lines.length > 40 || b.problem.length > 1500 ||
      b.lines.some((l) => typeof l.latex !== "string" || l.latex.length > 500) ||
      (b.lang !== undefined && b.lang !== "en" && b.lang !== "ko") ||
      (b.problemKind !== undefined && b.problemKind !== "solve" && b.problemKind !== "free") ||
      (b.steps !== undefined && (!Array.isArray(b.steps) || b.steps.length > 20 || b.steps.some((x) => typeof x?.latex !== "string" || x.latex.length > 600 || typeof x?.explain !== "string" || x.explain.length > 600))) ||
      (b.question !== undefined && (typeof b.question !== "string" || b.question.length > 300 || !b.question.trim())) ||
      (b.history !== undefined && (!Array.isArray(b.history) || b.history.length > 6 ||
        b.history.some((h) => typeof h?.q !== "string" || typeof h?.a !== "string" || h.q.length > 300 || h.a.length > 800)))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const free = b.problemKind === "free";
  const en = b.lang === "en";
  const lines = [...b.lines].sort((x, y) => x.line - y.line);
  const body = { ...b, lines };
  const question = b.question?.trim();
  const solution = b.solution === true;
  const review = b.review === true && !solution && !question;
  const more = typeof b.explainStep === "number" && Array.isArray(b.steps) && b.explainStep >= 0 && b.explainStep < b.steps.length && b.steps.length <= 20;
  const wrong = !question && !solution && !review && b.firstWrong !== null ? lines.find((l) => l.line === b.firstWrong) : undefined;

  const schema = more ? MORE_SCHEMA : solution ? solutionSchema(free) : review ? REVIEW_SCHEMA : question ? ANSWER_SCHEMA : wrong ? errorSchema(free, en) : NEXT_SCHEMA;
  const prompt = more
    ? morePrompt(body, b.explainStep as number)
    : solution
    ? solutionPrompt(body, free)
    : review
    ? reviewPrompt(body)
    : question
    ? askPrompt(body, question)
    : wrong
    ? errorPrompt(body, wrong, free)
    : nextPrompt(body, free);
  const system = SYSTEM_BASE + LEVEL[free ? "free" : "solve"] + (en ? EN_RULE : "");

  // authToken: null → 다른 인증 환경변수가 있어도 API 키만 사용
  client ??= new Anthropic({ apiKey, authToken: null });
  // 비용 절약: 짧은 힌트·질문은 Haiku 5.5, 정확도가 중요한 풀이 보기·증명 확인은 Sonnet 5.5
  const heavy = solution || review || more;
  const callSonnet = () =>
    client!.beta.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 8000,
      output_config: { effort: (solution || review) ? "medium" : "low", format: { type: "json_schema", schema } },
      // 안전 분류기가 거절하면 서버에서 추천 모델로 자동 재시도
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
    });
  const callHaiku = () =>
    client!.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: prompt }],
    });

  try {
    let res: { stop_reason: string | null; stop_details?: unknown; content: { type: string; text?: string }[] };
    if (heavy) {
      res = await callSonnet();
    } else {
      // Haiku는 서버 자동 대체가 없어서, 거절·오류·잘림이면 Sonnet으로 한 번 더
      try {
        res = await callHaiku();
        if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") res = await callSonnet();
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.RateLimitError) throw e;
        console.error("haiku failed, retrying with sonnet", e instanceof Anthropic.APIError ? e.status : e);
        res = await callSonnet();
      }
    }

    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      console.error("hint stop_reason", res.stop_reason, res.stop_details);
      return NextResponse.json({ error: "no_hint", detail: res.stop_reason }, { status: 502 });
    }
    const text = res.content.flatMap((c) => (c.type === "text" && c.text ? [c.text] : [])).join("");
    const data = parseJson(text);
    if (!data) {
      console.error("hint parse failed", res.content.map((c) => c.type), text.slice(0, 500));
      return NextResponse.json({ error: "parse", detail: res.content.map((c) => c.type).join(",") || "empty" }, { status: 502 });
    }
    if (solution && (!Array.isArray(data.steps) || data.steps.length === 0)) {
      return NextResponse.json({ error: "parse" }, { status: 502 });
    }
    const out: HintResponse = more
      ? { mode: "more", more: data.more }
      : solution
      ? { mode: "solution", steps: data.steps }
      : review
      ? { mode: "review", correct: !!data.correct, line: data.line > 0 ? data.line - 1 : null, feedback: data.feedback }
      : question
      ? { mode: "answer", answer: data.answer }
      : wrong
      ? { mode: "error", line: wrong.line, mistakeType: data.mistake_type, message: data.message }
      : { mode: "next", hints: [data.hint1, data.hint2, data.hint3] };
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "rate_limit" }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "bad_key" }, { status: 503 });
    if (e instanceof Anthropic.APIError) {
      console.error("claude api error", e.status, e.message);
      return NextResponse.json({ error: "api", detail: `${e.status ?? ""} ${shortMsg(e.message)}` }, { status: 502 });
    }
    console.error("hint error", e);
    const err = e as Error;
    return NextResponse.json({ error: "unknown", detail: `${err?.name ?? "Error"}: ${shortMsg(err?.message)}` }, { status: 500 });
  }
}
