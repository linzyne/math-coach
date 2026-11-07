import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type LineIn = { line: number; latex: string; status?: "ok" | "wrong" | "unparsed" };
type QA = { q: string; a: string };
type Body = { problem: string; lines: LineIn[]; firstWrong: number | null; question?: string; history?: QA[]; solution?: boolean; lang?: "en" | "ko" };

export type HintResponse =
  | { mode: "error"; line: number; mistakeType: string; message: string }
  | { mode: "next"; hints: [string, string, string] }
  | { mode: "answer"; answer: string }
  | { mode: "solution"; steps: SolutionStep[] };

export const STEP_KINDS = ["괄호 풀기", "분모 없애기", "이항", "동류항 정리", "양변 나누기", "약분", "기타"] as const;
export type SolutionStep = { latex: string; explain: string; kind?: (typeof STEP_KINDS)[number]; op?: string };

const MISTAKE_TYPES = ["부호 실수", "이항 실수", "분배법칙 실수", "계산 실수", "분모 처리 실수", "소수 처리 실수", "식 옮겨 쓰기 실수", "기타"] as const;
const MISTAKE_TYPES_EN = [
  "Sign error (부호 실수)",
  "Moving terms error (이항 실수)",
  "Expanding brackets error (분배법칙 실수)",
  "Arithmetic error (계산 실수)",
  "Fraction error (분모 처리 실수)",
  "Decimal error (소수 처리 실수)",
  "Copying error (식 옮겨 쓰기 실수)",
  "Other (기타)",
] as const;

/** 영어 모드: 학생이 영어 모국어 화자 */
const EN_RULE = `
[언어] 학생은 영어가 모국어야. 학생에게 보이는 모든 문장(message, hint1~3, answer, explain)은 쉬운 영어로 쓴다.
- 중요한 수학 용어는 한국 학교 수업을 따라갈 수 있게 처음 한 번은 한국어를 괄호로 붙인다. 예: move the term to the other side (이항), expand the brackets (괄호 풀기)
- 말투는 짧고 따뜻하게. "Line 2"처럼 줄 번호를 말한다.`;

const SYSTEM = `너는 중학생의 일차방정식 풀이를 돕는 다정한 수학 코치야.
가장 중요한 원칙: 학생이 스스로 고치고 스스로 풀게 한다. 정답이나 고친 식을 먼저 알려주지 않는다.
- 말투: 중학생에게 말하듯 짧고 따뜻한 존댓말(~해요). 한두 문장.
- 수식은 LaTeX 없이 평범한 글자로 쓴다. 예: 4x - 8 = 2x + 6, x/3
- 학생 풀이의 줄 번호는 사람이 읽는 번호(1부터)로 말한다.`;

function fmtLines(lines: LineIn[]) {
  if (lines.length === 0) return "(아직 아무것도 쓰지 않음)";
  return lines.map((l) => `${l.line + 1}번 줄: ${l.latex}${l.status === "unparsed" ? "  (자동 검사로 해석 못 함)" : ""}`).join("\n");
}

function errorPrompt(b: Body, wrong: LineIn) {
  const prev = b.lines.filter((l) => l.line < wrong.line && l.status === "ok").pop();
  return `문제: ${b.problem}

학생 풀이:
${fmtLines(b.lines)}

자동 검사 결과, 처음으로 틀린 줄은 ${wrong.line + 1}번 줄이에요. (바로 앞의 맞은 식: ${prev ? prev.latex : b.problem})
이 줄에서 어떤 종류의 실수를 했는지 골라 주고, 학생이 그 줄을 다시 살펴보게 하는 짧은 말을 써 줘.
- 틀린 위치(어느 부분/어느 항을 보면 되는지)와 실수 종류만 알려준다.
- 올바른 식, 올바른 숫자, 최종 답은 절대 쓰지 않는다.`;
}

function nextPrompt(b: Body) {
  return `문제: ${b.problem}

학생 풀이 (지금까지 모두 맞음):
${fmtLines(b.lines)}

학생이 다음 한 줄에서 막혔어요. 바로 다음 한 단계에 대한 힌트를 3단계로 써 줘.
- hint1 (방향만): 무엇을 하면 좋을지 방향만. 구체적인 숫자나 식은 쓰지 않는다.
- hint2 (구체적 행동): 어떤 항을 어떻게 하면 되는지 구체적으로. 하지만 결과 식은 쓰지 않는다.
- hint3 (그 줄 풀이): 바로 다음 한 줄의 식만 보여준다. 그 뒤의 단계나 최종 답까지 가지 않는다.
  (다음 한 줄이 곧 최종 답이라면 그 식을 보여줘도 된다.)`;
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
- 개념(이항, 분배법칙, 등식의 성질, 분모 없애기 등)은 쉽게 설명해도 된다. 예시가 필요하면 이 문제와 다른 숫자로 든다.
- 이 문제의 최종 답이나 남은 풀이 전체는 알려주지 않는다. 답을 바로 달라고 하면 부드럽게 거절하고, 스스로 생각해 볼 수 있는 질문이나 다음 행동 하나를 제안한다.
- 수학이나 이 문제와 상관없는 질문이면 짧게 받아주고 문제로 돌아오게 한다.
- 3문장 이내.`;
}

function solutionPrompt(b: Body) {
  return `문제: ${b.problem}

이 일차방정식의 정답 풀이를 중학교 교과서 방식으로 처음부터 끝까지 써 줘.
- steps의 각 항목은 한 줄(한 단계)의 식이다. 첫 줄은 문제를 변형한 첫 단계부터 시작하고, 마지막 줄은 반드시 'x = 값' 꼴로 끝낸다.
- latex: 그 줄의 식을 LaTeX로. 등호는 하나만. 분수는 \\frac{}{} 사용.
- explain: 그 줄에서 무엇을 했는지 한 문장 (예: "양변에서 5를 빼요.", "괄호를 풀어요.").
- kind: 그 줄에서 한 동작의 종류 (언어와 상관없이 아래 한국어 값 중 하나). 괄호 풀기 / 분모 없애기(양변에 수를 곱함) / 이항(항을 반대편으로 옮김, 양변에 더하거나 뺌) / 동류항 정리 / 양변 나누기 / 약분 / 기타
- op: 양변에 한 연산을 짧게. 예: "×6", "−5", "+2x", "÷2". 양변 연산이 아니면 빈 문자열.
- 한 줄에 한 가지 일만 한다. 보통 3~6줄.`;
}

const SOLUTION_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          latex: { type: "string" },
          explain: { type: "string" },
          kind: { type: "string", enum: [...STEP_KINDS] },
          op: { type: "string" },
        },
        required: ["latex", "explain", "kind", "op"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

const errorSchema = (en: boolean) => ({
  type: "object",
  properties: {
    mistake_type: { type: "string", enum: en ? [...MISTAKE_TYPES_EN] : [...MISTAKE_TYPES] },
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
      if (v && typeof v === "object") return v as Record<string, string>;
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  const apiKey = readApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "no_key", message: "Claude API 키가 없거나 형식이 달라요. Vercel의 ANTHROPIC_API_KEY 값을 확인해 주세요." },
      { status: 503 },
    );
  }
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof b?.problem !== "string" || !Array.isArray(b.lines) || b.lines.length > 40 || b.problem.length > 300 ||
      b.lines.some((l) => typeof l.latex !== "string" || l.latex.length > 300) ||
      (b.lang !== undefined && b.lang !== "en" && b.lang !== "ko") ||
      (b.question !== undefined && (typeof b.question !== "string" || b.question.length > 300 || !b.question.trim())) ||
      (b.history !== undefined && (!Array.isArray(b.history) || b.history.length > 6 ||
        b.history.some((h) => typeof h?.q !== "string" || typeof h?.a !== "string" || h.q.length > 300 || h.a.length > 800)))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const lines = [...b.lines].sort((x, y) => x.line - y.line);
  const question = b.question?.trim();
  const wrong = !question && b.firstWrong !== null ? lines.find((l) => l.line === b.firstWrong) : undefined;
  const solution = b.solution === true;
  const schema = solution ? SOLUTION_SCHEMA : question ? ANSWER_SCHEMA : wrong ? errorSchema(b.lang === "en") : NEXT_SCHEMA;
  const prompt = solution
    ? solutionPrompt(b)
    : question
    ? askPrompt({ ...b, lines }, question)
    : wrong
    ? errorPrompt({ ...b, lines }, wrong)
    : nextPrompt({ ...b, lines });

  // authToken: null → 다른 인증 환경변수가 있어도 API 키만 사용
  client ??= new Anthropic({ apiKey, authToken: null });
  try {
    const en = b.lang === "en";
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // 힌트는 짧은 일이라 낮은 effort로 빠르고 저렴하게
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      // 안전 분류기가 거절하면 서버에서 추천 모델로 자동 재시도
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: en ? SYSTEM + EN_RULE : SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      console.error("hint stop_reason", res.stop_reason, res.stop_details);
      return NextResponse.json(
        { error: "no_hint", message: `힌트를 만들지 못했어요. (${res.stop_reason})`, detail: res.stop_reason },
        { status: 502 },
      );
    }
    const text = res.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
    const data = parseJson(text);
    if (!data) {
      console.error("hint parse failed", res.stop_reason, res.content.map((c) => c.type), text.slice(0, 500));
      return NextResponse.json(
        { error: "parse", message: "힌트 형식을 읽지 못했어요.", detail: res.content.map((c) => c.type).join(",") || "empty" },
        { status: 502 },
      );
    }
    if (solution && (!Array.isArray(data.steps) || data.steps.length === 0)) {
      return NextResponse.json({ error: "parse", message: "풀이를 만들지 못했어요. 다시 눌러 주세요." }, { status: 502 });
    }
    const out: HintResponse = solution
      ? { mode: "solution", steps: data.steps }
      : question
      ? { mode: "answer", answer: data.answer }
      : wrong
      ? { mode: "error", line: wrong.line, mistakeType: data.mistake_type, message: data.message }
      : { mode: "next", hints: [data.hint1, data.hint2, data.hint3] };
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "rate_limit", message: "잠시 후 다시 눌러 주세요." }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "bad_key", message: "Claude API 키가 올바르지 않아요." }, { status: 503 });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("claude api error", e.status, e.message);
      return NextResponse.json(
        { error: "api", message: "힌트 서버에 문제가 있어요.", detail: `${e.status ?? ""} ${shortMsg(e.message)}` },
        { status: 502 },
      );
    }
    console.error("hint error", e);
    const err = e as Error;
    return NextResponse.json(
      { error: "unknown", message: "힌트를 만들지 못했어요.", detail: `${err?.name ?? "Error"}: ${shortMsg(err?.message)}` },
      { status: 500 },
    );
  }
}
