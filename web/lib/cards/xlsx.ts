// 엑셀(.xlsx) 첫 번째 시트를 표(행 × 열 글자)로 읽는다. A열=앞면, B열=뒷면, C열=태그.
// .xlsx 는 zip 안의 XML 이라서 fflate 로 풀고 DOMParser 로 읽는다.
import { unzipSync, strFromU8 } from "fflate";

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** <si>/<is> 안의 모든 <t> 글자를 이어 붙임 (서식 섞인 글자도) */
function textOf(el: Element): string {
  const ts = el.getElementsByTagName("t");
  let s = "";
  for (let i = 0; i < ts.length; i++) {
    // 윗첨자 발음 표기(rPh) 안의 글자는 빼기
    if (ts[i].parentElement?.tagName === "rPh" || ts[i].parentElement?.parentElement?.tagName === "rPh") continue;
    s += ts[i].textContent ?? "";
  }
  return s;
}

export function isXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK" (zip)
}

export function readXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes);
  const xml = (path: string) => {
    const f = files[path];
    return f ? new DOMParser().parseFromString(strFromU8(f), "application/xml") : null;
  };

  // 첫 번째 시트 파일 찾기
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = xml("xl/workbook.xml");
  const rels = xml("xl/_rels/workbook.xml.rels");
  const firstSheet = wb?.getElementsByTagName("sheet")[0];
  const rid = firstSheet?.getAttribute("r:id") ?? firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  if (rid && rels) {
    const rel = [...Array.from(rels.getElementsByTagName("Relationship"))].find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  }
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error("no sheet");

  const shared: string[] = [];
  const ss = xml("xl/sharedStrings.xml");
  if (ss) {
    const sis = ss.getElementsByTagName("si");
    for (let i = 0; i < sis.length; i++) shared.push(textOf(sis[i]));
  }

  const rows: string[][] = [];
  const rowEls = sheet.getElementsByTagName("row");
  for (let r = 0; r < rowEls.length; r++) {
    const cells = rowEls[r].getElementsByTagName("c");
    const row: string[] = [];
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const ref = cell.getAttribute("r");
      const idx = ref ? colIndex(ref) : row.length;
      const type = cell.getAttribute("t");
      const v = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      let val: string;
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = textOf(cell.getElementsByTagName("is")[0] ?? cell);
      else if (type === "b") val = v === "1" ? "TRUE" : "FALSE";
      else val = v;
      while (row.length < idx) row.push("");
      row[idx] = val.trim();
    }
    if (row.some((x) => x)) rows.push(row);
  }
  return rows;
}

/** 첫 줄이 "질문 / 대답" 같은 제목 줄이면 뺀다 */
export function dropHeader(rows: string[][]): string[][] {
  if (!rows.length) return rows;
  const head = /^(질문|문제|앞면|단어|스페인어|front|question|word|spanish|español|term|q)$/i;
  const head2 = /^(대답|답|정답|뒷면|뜻|의미|back|answer|meaning|definition|translation|a)$/i;
  const [a, b] = rows[0].map((x) => (x ?? "").trim());
  return head.test(a ?? "") || head2.test(b ?? "") ? rows.slice(1) : rows;
}

/** 텍스트 파일: UTF-8이 아니면 한국어 윈도우 엑셀 CSV(EUC-KR)로 읽기 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes);
    }
  }
}
