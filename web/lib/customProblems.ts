import type { ProblemLike } from "./problems";

/** latex: 방정식 풀기 문제 / statement: 글+$수식$ 문제 (증명 등). 예전 저장분은 latex만 있음 */
export type CustomProblem = { id: string; latex?: string; statement?: string; kind?: "solve" | "free"; createdAt: number };
export type NewProblem = { statement: string; kind: "solve" | "free"; latex?: string };

export function toProblem(c: CustomProblem): ProblemLike {
  const kind = c.kind ?? "solve";
  return {
    statement: c.statement ?? "$" + (c.latex ?? "") + "$",
    kind,
    latex: c.latex,
    answerType: kind === "free" ? "other" : undefined,
  };
}

const KEY = "customProblems";

export function loadCustom(): CustomProblem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(list: CustomProblem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function addCustom(list: NewProblem[]): CustomProblem[] {
  const now = Date.now();
  const added = list.map((p, i) => ({ id: "c" + now.toString(36) + i, ...p, createdAt: now }));
  save([...loadCustom(), ...added]);
  return added;
}

export function removeCustom(id: string) {
  save(loadCustom().filter((p) => p.id !== id));
  try {
    for (const k of [`ink:${id}`, `typed:${id}`, `hints:${id}`]) localStorage.removeItem(k);
  } catch {}
}

/** 붙여넣은 글 → 문제 목록. 줄마다 짧은 방정식이면 한 줄에 하나씩, 아니면 글 전체를 문제 하나로 */
export function parsePasted(text: string): string[] {
  const eqs = splitEquations(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const allShortEquations =
    eqs.length > 0 &&
    eqs.length === lines.length &&
    lines.every((l) => l.length < 80 && !/[a-zA-Z]{4,}/.test(l.replace(/\\[a-zA-Z]+/g, "")));
  if (allShortEquations) return eqs.map((e) => "$" + e + "$");
  const whole = text.trim().replace(/^(\(?\s*(\d{1,3}|[a-zA-Z])\s*[).:])\s*/, "");
  return whole ? [whole] : [];
}

function splitEquations(text: string): string[] {
  return text
    .split(/\r?\n|;/)
    .map((l) =>
      l
        .trim()
        .replace(/^\$+|\$+$/g, "")
        .replace(/^(\(?\s*(\d{1,3}|[a-zA-Z]|[ivx]{1,4})\s*[).:]|\d{1,3}\s*번\.?|[-•*·])\s*/, "")
        .replace(/^\\\(|\\\)$/g, "")
        .trim(),
    )
    .filter((l) => l.includes("="));
}

/** 사진을 긴 변 1600px JPEG로 줄여서 base64로 (업로드 용량·비용 절약) */
export async function imageToBase64(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}
