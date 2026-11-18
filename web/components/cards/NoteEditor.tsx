"use client";

import { useRef, useState } from "react";
import type { Card, NoteType } from "@/lib/cards/types";
import { uid } from "@/lib/cards/types";
import { addNote, clozeNumbers, ensureDeck, sortedDecks, updateNote } from "@/lib/cards/collection";
import { useCards } from "./store";
import CardFace from "./CardFace";

type FieldKey = "front" | "back" | "extra";

/** 사진을 줄여서 data URL로 (아이폰 사진은 크니까 긴 변 1200px, JPEG) */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 노트 추가/편집. noteId가 있으면 편집, 없으면 추가 화면 (asPage면 탭 안의 페이지로)
 */
export default function NoteEditor({ noteId, onClose, asPage }: { noteId?: string; onClose?: () => void; asPage?: boolean }) {
  const { col, mutate, t, toast } = useCards();
  const existing = noteId ? col.notes.find((n) => n.id === noteId) : undefined;
  const lastDeck = col.decks.find((d) => d.id === col.settings.lastDeckId) ?? sortedDecks(col)[0];
  const [type, setType] = useState<NoteType>(() => existing?.type ?? ((localStorage.getItem("fc-type") as NoteType | null) || "basic"));
  const [front, setFront] = useState(existing?.fields.front ?? "");
  const [back, setBack] = useState(existing?.fields.back ?? "");
  const [extra, setExtra] = useState(existing?.fields.extra ?? "");
  const [tags, setTags] = useState(() => existing?.tags.join(" ") ?? (localStorage.getItem("fc-tags") ?? ""));
  const [deckName, setDeckName] = useState(col.decks.find((d) => d.id === existing?.deckId)?.name ?? lastDeck.name);
  const [previewing, setPreviewing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [focus, setFocus] = useState<FieldKey>("front");
  const refs = { front: useRef<HTMLTextAreaElement>(null), back: useRef<HTMLTextAreaElement>(null), extra: useRef<HTMLTextAreaElement>(null) };
  const fileRef = useRef<HTMLInputElement>(null);
  const setters = { front: setFront, back: setBack, extra: setExtra };
  const values = { front, back, extra };

  /** 선택한 글자를 감싸거나 커서 위치에 넣기 */
  const wrap = (key: FieldKey, before: string, after: string, placeholder = "") => {
    const el = refs[key].current;
    const v = values[key];
    const s = el?.selectionStart ?? v.length;
    const e = el?.selectionEnd ?? v.length;
    const sel = v.slice(s, e) || placeholder;
    const next = v.slice(0, s) + before + sel + after + v.slice(e);
    setters[key](next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = s + before.length;
      el.setSelectionRange(pos, pos + sel.length);
    });
  };

  const cloze = (same: boolean) => {
    const nums = clozeNumbers(front);
    const max = nums.length ? Math.max(...nums) : 0;
    const n = same ? Math.max(1, max) : max + 1;
    if (type !== "cloze") setType("cloze");
    wrap("front", `{{c${n}::`, "}}", "…");
  };

  const insertImage = async (file: File) => {
    const data = await shrinkImage(file);
    const id = uid();
    mutate((c) => {
      c.media = { ...(c.media ?? {}), [id]: data };
    });
    wrap(focus, "", `![](media:${id})`);
  };

  const save = () => {
    if (!front.trim()) return toast(t.needFront);
    if (type === "cloze" && !clozeNumbers(front).length) return toast(t.needCloze);
    const tagList = tags.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    const fields = type === "cloze" ? { front, back: "", extra } : { front, back };
    mutate((c) => {
      const deck = ensureDeck(c, deckName);
      if (existing) {
        updateNote(c, existing.id, { type, fields, tags: tagList });
        if (existing.deckId !== deck.id) {
          existing.deckId = deck.id;
          for (const card of c.cards) if (card.noteId === existing.id) card.deckId = deck.id;
        }
      } else {
        addNote(c, type, fields, tagList, deck.id);
        c.settings.lastDeckId = deck.id;
      }
    });
    if (existing) {
      toast(t.saved);
      onClose?.();
    } else {
      try {
        localStorage.setItem("fc-type", type);
        localStorage.setItem("fc-tags", tags);
      } catch {}
      toast(t.added);
      setFront("");
      setBack("");
      setExtra("");
      setPreviewing(false);
      requestAnimationFrame(() => refs.front.current?.focus());
    }
  };

  // 미리보기용 가짜 노트·카드
  const pvNote = { id: "pv", type, fields: { front, back, extra }, tags: [], deckId: "", created: 0, modified: front.length + back.length * 7 + extra.length * 13 };
  const pvCard: Card = { id: "pv", noteId: "pv", deckId: "", ord: type === "cloze" ? (clozeNumbers(front)[0] ?? 1) - 1 : 0, state: "new", queue: "new", due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, flag: 0, created: 0 };

  const field = (key: FieldKey, label: string, rows: number) => (
    <label className="fc-field">
      <span>{label}</span>
      <textarea
        ref={refs[key]}
        rows={rows}
        value={values[key]}
        onFocus={() => setFocus(key)}
        onChange={(e) => setters[key](e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) { e.preventDefault(); cloze(e.altKey); }
        }}
        onPaste={(e) => {
          const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
          if (f) { e.preventDefault(); void insertImage(f); }
        }}
        autoCapitalize="off"
      />
    </label>
  );

  const body = (
    <div className="fc-editor">
      <div className="fc-row2">
        <label className="fc-field">
          <span>{t.type}</span>
          <select value={type} onChange={(e) => setType(e.target.value as NoteType)}>
            <option value="basic">{t.typeBasic}</option>
            <option value="reversed">{t.typeReversed}</option>
            <option value="cloze">{t.typeCloze}</option>
          </select>
        </label>
        <label className="fc-field">
          <span>{t.deck}</span>
          <input list="fc-decks" value={deckName} onChange={(e) => setDeckName(e.target.value)} autoCapitalize="off" />
          <datalist id="fc-decks">{sortedDecks(col).map((d) => <option key={d.id} value={d.name} />)}</datalist>
        </label>
      </div>

      <div className="fc-tools">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cloze(false)}>{t.clozeBtn}</button>
        {type === "cloze" && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cloze(true)}>{t.clozeSame}</button>}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(focus, "$", "$", "x")}>{t.mathBtn}</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(focus, "**", "**")}><b>{t.boldBtn}</b></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}>{t.imgBtn}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImage(f); e.target.value = ""; }} />
      </div>

      {type === "cloze" ? (
        <>
          {field("front", t.text, 4)}
          <p className="fc-help">{t.clozeHelp}</p>
          {field("extra", t.extra, 2)}
        </>
      ) : (
        <>
          {field("front", t.front, 3)}
          {field("back", t.back, 3)}
          <p className="fc-help">{t.formatHelp}</p>
        </>
      )}

      <label className="fc-field">
        <span>{t.tags}</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} autoCapitalize="off" autoCorrect="off" />
      </label>

      <button type="button" className="link" onClick={() => setPreviewing((p) => !p)}>{previewing ? "▾ " : "▸ "}{t.preview}</button>
      {previewing && front.trim() && (
        <div className="fc-preview" onClick={() => setFlipped((f) => !f)}>
          <CardFace note={pvNote} card={pvCard} showBack={flipped} media={col.media} />
          <span className="fc-preview-tip">{t.flip} ↻</span>
        </div>
      )}
    </div>
  );

  if (asPage) {
    return (
      <div className="fc-page">
        <header className="fc-head">
          <h1>{t.tabAdd}</h1>
          <button className="primary" onClick={save}>{t.add}</button>
        </header>
        {body}
      </div>
    );
  }
  return (
    <div className="fc-sheet-bg">
      <div className="fc-sheet" role="dialog" aria-modal="true">
        <header className="fc-sheet-head">
          <button className="link" onClick={onClose}>{t.cancel}</button>
          <b>{existing ? t.edit : t.tabAdd}</b>
          <button className="link strong" onClick={save}>{existing ? t.save : t.add}</button>
        </header>
        <div className="fc-sheet-body">{body}</div>
      </div>
    </div>
  );
}
