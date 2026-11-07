import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = { strokes: { x: number[][]; y: number[][] } };

const MAX_STROKES = 200;
const MAX_POINTS = 20000;

/** 한 줄의 획을 Mathpix v3/strokes로 보내 LaTeX로 바꾼다. 키는 서버에서만 사용 */
export async function POST(req: Request) {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (!appId || !appKey) {
    return NextResponse.json({ error: "no_key", message: "Mathpix 키가 설정되지 않았어요." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const xs = body?.strokes?.x;
  const ys = body?.strokes?.y;
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length === 0 || xs.length !== ys.length || xs.length > MAX_STROKES) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const total = xs.reduce((n, s) => n + (Array.isArray(s) ? s.length : 0), 0);
  if (total > MAX_POINTS) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const res = await fetch("https://api.mathpix.com/v3/strokes", {
    method: "POST",
    headers: { app_id: appId, app_key: appKey, "Content-Type": "application/json" },
    body: JSON.stringify({ strokes: { strokes: { x: xs, y: ys } } }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) {
    console.error("mathpix error", res.status, data.error ?? data);
    return NextResponse.json({ error: "mathpix", message: "글씨 인식에 실패했어요." }, { status: 502 });
  }

  const latex = cleanLatex(String(data.latex_styled ?? data.text ?? ""));
  return NextResponse.json({ latex, confidence: typeof data.confidence === "number" ? data.confidence : null });
}

function cleanLatex(s: string): string {
  return s
    .trim()
    .replace(/^\\\(|\\\)$/g, "")
    .replace(/^\\\[|\\\]$/g, "")
    .replace(/^\$+|\$+$/g, "")
    .trim();
}
