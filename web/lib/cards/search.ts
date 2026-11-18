// 앙키식 검색: 단어(AND), -부정, "구절", deck:이름, tag:태그, is:new|learn|review|due|suspended|buried, flag:1~4, prop:ivl>10 등
import type { Card, Collection, Note } from "./types";
import { dayNumber } from "./scheduler";
import { plainText } from "./render";

function tokenize(q: string): string[] {
  const out: string[] = [];
  for (const m of q.matchAll(/-?(?:\w+:)?"[^"]*"|\S+/g)) out.push(m[0].replace(/"/g, ""));
  return out;
}

function wild(pat: string): RegExp {
  return new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
}

export function searchCards(col: Collection, query: string, now: number): { card: Card; note: Note }[] {
  const today = dayNumber(now, col.settings.dayStartHour);
  const notes = new Map(col.notes.map((n) => [n.id, n]));
  const decks = new Map(col.decks.map((d) => [d.id, d.name]));
  const tests = tokenize(query.trim()).map((raw) => {
    const neg = raw.startsWith("-") && raw.length > 1;
    const tok = neg ? raw.slice(1) : raw;
    const [k, ...rest] = tok.split(":");
    const v = rest.join(":");
    let fn: (c: Card, n: Note) => boolean;
    const key = rest.length ? k.toLowerCase() : "";
    if (key === "deck") {
      const re = wild(v);
      const reChild = wild(v + "::*");
      fn = (c) => re.test(decks.get(c.deckId) ?? "") || reChild.test(decks.get(c.deckId) ?? "");
    } else if (key === "tag") {
      const re = wild(v);
      fn = (_c, n) => (v === "none" ? n.tags.length === 0 : n.tags.some((t) => re.test(t) || t.toLowerCase().startsWith(v.toLowerCase() + "::")));
    } else if (key === "is") {
      fn = (c) => {
        switch (v) {
          case "new": return c.state === "new";
          case "learn": return c.state === "learning" || c.state === "relearning";
          case "review": return c.state === "review" || c.state === "relearning";
          case "due": return (c.queue === "review" && c.due <= today) || (c.queue === "learning" && c.due <= now);
          case "suspended": return c.queue === "suspended";
          case "buried": return c.queue === "buried";
          default: return false;
        }
      };
    } else if (key === "flag") {
      fn = (c) => c.flag === Number(v);
    } else if (key === "card") {
      fn = (c) => String(c.ord + 1) === v;
    } else if (key === "note") {
      fn = (_c, n) => n.type === v;
    } else if (key === "prop") {
      const m = v.match(/^(ivl|due|reps|lapses|ease)(<=|>=|!=|=|<|>)(-?[\d.]+)$/);
      fn = (c) => {
        if (!m) return false;
        const val = m[1] === "ivl" ? c.interval : m[1] === "due" ? (c.queue === "review" ? c.due - today : NaN) : m[1] === "ease" ? c.ease : m[1] === "reps" ? c.reps : c.lapses;
        const x = Number(m[3]);
        return { "<": val < x, ">": val > x, "<=": val <= x, ">=": val >= x, "=": val === x, "!=": val !== x }[m[2]] ?? false;
      };
    } else if (key === "added" || key === "rated") {
      const days = Number(v.split(":")[0]) || 1;
      const since = now - days * 86400000;
      fn = key === "added" ? (c) => c.created >= since : (c) => col.revlog.some((r) => r.cardId === c.id && r.time >= since);
    } else {
      const needle = tok.toLowerCase();
      fn = (_c, n) => (n.fields.front + " " + n.fields.back + " " + (n.fields.extra ?? "")).toLowerCase().includes(needle) || plainText(n.fields.front, 1e9).toLowerCase().includes(needle);
    }
    return neg ? (c: Card, n: Note) => !fn(c, n) : fn;
  });
  const out: { card: Card; note: Note }[] = [];
  for (const card of col.cards) {
    const note = notes.get(card.noteId);
    if (note && tests.every((t) => t(card, note))) out.push({ card, note });
  }
  return out;
}
