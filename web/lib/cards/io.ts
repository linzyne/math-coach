// 가져오기·내보내기: 전체 백업(JSON), 텍스트(TSV/CSV, 앙키 "Notes in Plain Text"와 호환)
import type { Collection, NoteType } from "./types";
import { addNote, ensureDeck } from "./collection";

export function exportJson(col: Collection): string {
  return JSON.stringify(col);
}

export function parseBackup(text: string): Collection {
  const col = JSON.parse(text) as Collection;
  if (!Array.isArray(col.decks) || !Array.isArray(col.notes) || !Array.isArray(col.cards)) throw new Error("bad backup");
  return col;
}

/** 구분자 자동 감지 (탭 > 세미콜론 > 쉼표), 따옴표 묶음 지원 */
export function parseDelimited(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  const sample = lines.slice(0, 10).join("\n");
  const sep = sample.includes("\t") ? "\t" : sample.includes(";") && !sample.includes(",") ? ";" : sample.includes(",") ? "," : "\t";
  const rows: string[][] = [];
  const body = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => !l.startsWith("#")).join("\n");
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); if (row.some((c) => c.trim())) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** 앙키 HTML 필드를 이 앱의 텍스트 표기로 */
export function fromAnkiHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<[^>]+>/g, "")
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, x) => `$${x}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, x) => `$$${x}$$`)
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function importRows(col: Collection, rows: string[][], deckName: string, type: NoteType | "auto", tagCol: boolean): number {
  const deck = ensureDeck(col, deckName);
  let n = 0;
  for (const r of rows) {
    const front = fromAnkiHtml(r[0] ?? "");
    if (!front) continue;
    const back = fromAnkiHtml(r[1] ?? "");
    const tags = tagCol && r[2] ? r[2].split(/\s+/).filter(Boolean) : [];
    const isCloze = /\{\{c\d+::/.test(front);
    const t: NoteType = type === "auto" ? (isCloze ? "cloze" : "basic") : type;
    if (t === "cloze" && !isCloze) continue;
    addNote(col, t, t === "cloze" ? { front, back: "", extra: back } : { front, back }, tags, deck.id);
    n++;
  }
  return n;
}

export function exportTsv(col: Collection, deckIds: Set<string> | null): string {
  const cell = (s: string) => (/[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const lines = ["#separator:tab", "#columns:Front\tBack\tTags"];
  for (const n of col.notes) {
    if (deckIds && !deckIds.has(n.deckId)) continue;
    const back = n.type === "cloze" ? n.fields.extra ?? "" : n.fields.back;
    lines.push([cell(n.fields.front), cell(back), cell(n.tags.join(" "))].join("\t"));
  }
  return lines.join("\n");
}

export function download(name: string, text: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
