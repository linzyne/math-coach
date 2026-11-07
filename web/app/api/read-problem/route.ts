import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { image: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

const SCHEMA = {
  type: "object",
  properties: {
    problems: { type: "array", items: { type: "string" } },
  },
  required: ["problems"],
  additionalProperties: false,
};

const PROMPT = `This is a photo of a math worksheet or textbook page.
Find every equation the student is asked to solve and return each one as LaTeX in "problems", in the order they appear.
- Only the equation itself (e.g. "3x + 5 = 20", "\\\\frac{x+1}{2} = \\\\frac{x-2}{3} + 2"). No problem numbers, no instructions, no answers.
- Copy the equation exactly as printed. Do not simplify or solve it.
- Ignore handwritten working, answers and anything that is not an equation to solve.
- If there is no equation, return an empty list.`;

function readApiKey(): string | null {
  const m = (process.env.ANTHROPIC_API_KEY ?? "").match(/sk-ant-[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}

let client: Anthropic | null = null;

/** 문제 사진 → 방정식 LaTeX 목록 (Claude 이미지 인식). 키는 서버에서만 사용 */
export async function POST(req: Request) {
  const apiKey = readApiKey();
  if (!apiKey) return NextResponse.json({ error: "no_key" }, { status: 503 });

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof b?.image !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(b.mediaType) || b.image.length > 4_000_000) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  client ??= new Anthropic({ apiKey, authToken: null });
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: b.mediaType, data: b.image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "no_hint", detail: res.stop_reason }, { status: 502 });
    }
    const text = res.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
    let problems: string[] = [];
    try {
      const d = JSON.parse(text);
      if (Array.isArray(d.problems)) problems = d.problems.filter((x: unknown) => typeof x === "string").slice(0, 30);
    } catch {
      return NextResponse.json({ error: "parse" }, { status: 502 });
    }
    return NextResponse.json({ problems });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "rate_limit" }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "bad_key" }, { status: 503 });
    if (e instanceof Anthropic.APIError) {
      console.error("read-problem api error", e.status, e.message);
      return NextResponse.json({ error: "api", detail: String(e.status ?? "") }, { status: 502 });
    }
    console.error("read-problem error", e);
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
