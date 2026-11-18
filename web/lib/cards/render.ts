// 카드 앞·뒷면 HTML 만들기. 필드는 간단한 마크업을 지원:
// $수식$, $$수식$$, **굵게**, *기울임*, 줄바꿈, ![](이미지 data URL), {{c1::답::힌트}}
import katex from "katex";
import type { Card, Note } from "./types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 필드 텍스트 → 안전한 HTML */
export function fieldHtml(src: string, media?: Record<string, string>): string {
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|!\[[^\]]*\]\(((?:data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)|(?:https?:\/\/[^\s)]+)|(?:media:[a-z0-9]+))\)/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    out.push(inline(src.slice(last, m.index)));
    if (m[1] !== undefined) out.push(katex.renderToString(m[1], { throwOnError: false, displayMode: true }));
    else if (m[2] !== undefined) out.push(katex.renderToString(m[2], { throwOnError: false }));
    else {
      const url = m[3].startsWith("media:") ? media?.[m[3].slice(6)] : m[3];
      if (url) out.push(`<img src="${esc(url)}" alt="" />`);
    }
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(inline(src.slice(last)));
  return out.join("");
}

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/\n/g, "<br>");
}

/** {{c1::답::힌트}} 를 찾아 바꾼다. 답 안의 {…} 짝을 세서 \binom{n}{r}}} 같은 수식도 처리 */
export function replaceCloze(text: string, fn: (num: number, ans: string, hint?: string) => string): string {
  let out = "";
  let i = 0;
  const open = /\{\{c(\d+)::/g;
  while (i < text.length) {
    open.lastIndex = i;
    const m = open.exec(text);
    if (!m) break;
    const start = m.index + m[0].length;
    let depth = 0;
    let j = start;
    let hintAt = -1;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (ch === "\\") { j++; continue; }
      if (depth === 0 && ch === "}" && text[j + 1] === "}") break;
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
      else if (depth === 0 && ch === ":" && text[j + 1] === ":") hintAt = j;
    }
    if (j >= text.length) break; // 닫는 }} 없음
    const inner = text.slice(start, j);
    const ans = hintAt >= 0 ? text.slice(start, hintAt) : inner;
    const hint = hintAt >= 0 ? text.slice(hintAt + 2, j) : undefined;
    out += text.slice(i, m.index) + fn(Number(m[1]), ans, hint);
    i = j + 2;
  }
  return out + text.slice(i);
}

/** cloze 본문을 앞면(가림)/뒷면(공개)으로. 수식 안의 cloze도 처리하려고 먼저 치환한 뒤 렌더링 */
function clozeSide(text: string, num: number, back: boolean, media?: Record<string, string>): string {
  const OPEN = "\u0001", CLOSE = "\u0002";
  const replaced = replaceCloze(text, (n, ans, hint) => {
    if (n !== num) return ans;
    if (back) return OPEN + ans + CLOSE;
    return OPEN + (hint ? `[${hint}]` : "[...]") + CLOSE;
  });
  // 수식 안에 표시 문자가 있으면 KaTeX \htmlClass 대신 색으로 강조
  const inMath = replaced.replace(/\$\$?[^$]*\$\$?/g, (m) => m.replace(new RegExp(OPEN, "g"), "{\\color{#2f6fdb}").replace(new RegExp(CLOSE, "g"), "}").replace(/\[\.\.\.\]/g, "[\\dots]"));
  return fieldHtml(inMath, media)
    .replace(new RegExp(OPEN, "g"), '<span class="fc-cloze">')
    .replace(new RegExp(CLOSE, "g"), "</span>");
}

export function renderCard(note: Note, card: Card, media?: Record<string, string>): { front: string; back: string } {
  const f = note.fields;
  const fh = (s: string) => fieldHtml(s, media);
  if (note.type === "cloze") {
    const n = card.ord + 1;
    const extra = f.extra?.trim() ? `<div class="fc-extra">${fh(f.extra)}</div>` : "";
    return { front: clozeSide(f.front, n, false, media), back: clozeSide(f.front, n, true, media) + extra };
  }
  const [q, a] = card.ord === 1 ? [f.back, f.front] : [f.front, f.back];
  return { front: fh(q), back: fh(q) + '<hr class="fc-answer-rule" />' + fh(a) };
}

/** 목록에 보여줄 짧은 글 */
export function plainText(src: string, max = 80): string {
  const t = replaceCloze(src, (_n, ans) => ans)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "🖼")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}
