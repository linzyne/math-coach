"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, Ease, Note } from "@/lib/cards/types";
import { addExtra, answer, dayNumber, deckCounts, deckFamily, formatIvl, formatSecs, nextCard, nextLearningDue, preview } from "@/lib/cards/scheduler";
import { bury, burySiblings, deleteNotes, setSuspended } from "@/lib/cards/collection";
import { useCards } from "./store";
import CardFace from "./CardFace";
import NoteEditor from "./NoteEditor";

const FLAG_COLORS = ["", "#e5484d", "#f08c00", "#30a46c", "#3e63dd"];

interface UndoEntry {
  cards: Card[];
  note: Note;
  revlogLen: number;
  cardId: string;
}

export default function Study({ deckId, onExit }: { deckId: string; onExit: () => void }) {
  const { col, mutate, t, lang, toast, version } = useCards();
  const [now, setNow] = useState(() => Date.now());
  const [showBack, setShowBack] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const shownAt = useRef(Date.now());
  const deck = col.decks.find((d) => d.id === deckId);

  // 카드 고르기: 현재 카드가 없거나 공부할 수 없게 되면 다음 카드
  const pick = useCallback(() => {
    const n = Date.now();
    setNow(n);
    const c = nextCard(col, deckId, n);
    setCurrent(c?.id ?? null);
    setShowBack(false);
    shownAt.current = n;
  }, [col, deckId]);

  useEffect(() => {
    if (current === null) pick();
    else {
      const c = col.cards.find((x) => x.id === current);
      if (!c || c.queue === "suspended" || c.queue === "buried" || !deckFamily(col, deckId).has(c.deckId)) pick();
    }
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = current ? col.cards.find((c) => c.id === current) ?? null : null;
  const note = card ? col.notes.find((n) => n.id === card.noteId) ?? null : null;
  const counts = useMemo(() => deckCounts(col, deckId, now), [col, deckId, now, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const cfg = deck?.config;
  const today = dayNumber(now, col.settings.dayStartHour);

  // 기다리는 학습 카드가 있으면 시간이 되면 다시 확인
  const waitDue = !card ? nextLearningDue(col, deckId, now) : null;
  useEffect(() => {
    if (!waitDue) return;
    const ms = Math.max(1000, waitDue - Date.now() - 20 * 60000);
    const id = setTimeout(pick, Math.min(ms, 60000));
    return () => clearTimeout(id);
  }, [waitDue, pick]);

  const rate = useCallback((ease: Ease) => {
    if (!card || !note || !cfg || !showBack) return;
    const entry: UndoEntry = {
      cards: col.cards.filter((c) => c.noteId === note.id).map((c) => ({ ...c })),
      note: { ...note, tags: [...note.tags] },
      revlogLen: col.revlog.length,
      cardId: card.id,
    };
    let leech = false;
    mutate((c) => {
      const n = Date.now();
      const wasNewOrReview = card.state === "new" || card.state === "review";
      const log = answer(card, ease, cfg, dayNumber(n, c.settings.dayStartHour), n, Math.min(60000, n - shownAt.current));
      c.revlog.push(log);
      if (cfg.buryNewSiblings && wasNewOrReview) burySiblings(c, card, n);
      if (ease === 1 && log.type === "review" && card.lapses >= cfg.leechThreshold && card.lapses % Math.max(1, Math.ceil(cfg.leechThreshold / 2)) === 0) {
        leech = true;
        card.queue = "suspended";
        if (!note.tags.includes("leech")) note.tags.push("leech");
      }
    });
    if (leech) toast(t.leech);
    setUndo((u) => [...u.slice(-29), entry]);
    pick();
  }, [card, note, cfg, showBack, col, mutate, pick, toast, t]);

  const doUndo = useCallback(() => {
    const e = undo[undo.length - 1];
    if (!e) return;
    mutate((c) => {
      const byId = new Map(e.cards.map((x) => [x.id, x]));
      c.cards = c.cards.map((x) => byId.get(x.id) ?? x);
      const n = c.notes.find((x) => x.id === e.note.id);
      if (n) n.tags = e.note.tags;
      c.revlog.length = e.revlogLen;
    });
    setUndo((u) => u.slice(0, -1));
    setCurrent(e.cardId);
    setShowBack(false);
    shownAt.current = Date.now();
    toast(t.undone);
  }, [undo, mutate, toast, t]);

  const reveal = useCallback(() => {
    if (card && !showBack) setShowBack(true);
  }, [card, showBack]);

  // 키보드 (아이패드·블루투스 키보드용)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!showBack) reveal();
        else rate(3);
      } else if (showBack && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Ease);
      else if (e.key === "z" || e.key === "Z") doUndo();
      else if ((e.key === "e" || e.key === "E") && card) setEditing(true);
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBack, reveal, rate, doUndo, editing, card, onExit]);

  const act = (fn: () => void, msg?: string) => {
    setMenu(false);
    fn();
    if (msg) toast(msg);
  };

  const buttons: { ease: Ease; label: string; cls: string }[] = [
    { ease: 1, label: t.again, cls: "again" },
    { ease: 2, label: t.hard, cls: "hard" },
    { ease: 3, label: t.good, cls: "good" },
    { ease: 4, label: t.easy, cls: "easy" },
  ];

  const kind = card ? (card.queue === "new" ? "n" : card.queue === "learning" ? "l" : "r") : "";

  return (
    <div className="fc-study">
      <header className="fc-study-head">
        <button className="fc-iconbtn" onClick={onExit} aria-label={t.back2}>‹</button>
        <div className="fc-study-title">
          <span className="fc-study-deck">{deck?.name.split("::").pop()}</span>
          {col.settings.showRemaining && (
            <span className="fc-counts">
              <b className={`c-new ${kind === "n" ? "cur" : ""}`}>{counts.newCount}</b>
              <b className={`c-learn ${kind === "l" ? "cur" : ""}`}>{counts.learnCount}</b>
              <b className={`c-due ${kind === "r" ? "cur" : ""}`}>{counts.reviewCount}</b>
            </span>
          )}
        </div>
        <button className="fc-iconbtn" onClick={doUndo} disabled={!undo.length} aria-label={t.undo}>↶</button>
        <button className="fc-iconbtn" onClick={() => setMenu((m) => !m)} disabled={!card} aria-label={t.more}>⋯</button>
      </header>

      {menu && card && note && (
        <>
          <div className="fc-menu-bg" onClick={() => setMenu(false)} />
          <div className="fc-menu" role="menu">
            <button onClick={() => act(() => setEditing(true))}>✏️ {t.edit}</button>
            <div className="fc-menu-flags">
              {[1, 2, 3, 4].map((f) => (
                <button key={f} aria-label={`${t.flag} ${f}`} className={card.flag === f ? "on" : ""} style={{ color: FLAG_COLORS[f] }}
                  onClick={() => act(() => mutate(() => { card.flag = card.flag === f ? 0 : f; }))}>⚑</button>
              ))}
            </div>
            <button onClick={() => act(() => mutate((c) => bury(c, new Set([card.id]), Date.now())), t.buried)}>💤 {t.bury}</button>
            <button onClick={() => act(() => mutate((c) => setSuspended(c, new Set([card.id]), true)), t.suspended)}>⏸ {t.suspend}</button>
            <button className="danger" onClick={() => act(() => { if (confirm(t.delCardsConfirm(1))) mutate((c) => deleteNotes(c, new Set([note.id]))); })}>🗑 {t.deleteNote}</button>
          </div>
        </>
      )}

      {card && note ? (
        <>
          <div className="fc-card-area" onClick={reveal}>
            {card.flag > 0 && <span className="fc-flag" style={{ color: FLAG_COLORS[card.flag] }}>⚑</span>}
            <CardFace note={note} card={card} showBack={showBack} media={col.media} />
          </div>
          <footer className="fc-answer-bar">
            {!showBack ? (
              <button className="fc-show" onClick={reveal}>{t.show}</button>
            ) : (
              <div className="fc-ease-row">
                {buttons.map((b) => (
                  <button key={b.ease} className={`fc-ease ${b.cls}`} onClick={() => rate(b.ease)}>
                    {col.settings.showIntervals && cfg && (
                      <small>{formatIvl(preview(card, b.ease, cfg, today, Date.now()).outcome, Date.now(), lang)}</small>
                    )}
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            )}
          </footer>
        </>
      ) : (
        <div className="fc-done">
          <p className="fc-done-big">{t.congrats}</p>
          <p className="muted">{waitDue ? t.waiting(formatSecs((waitDue - now) / 1000, lang)) : t.congratsSub}</p>
          <div className="fc-done-actions">
            <button className="ghost" onClick={() => { mutate((c) => addExtra(c, deckId, Date.now(), 10, 0)); }}>{t.extraNew}</button>
            <button className="ghost" onClick={() => { mutate((c) => addExtra(c, deckId, Date.now(), 0, 50)); }}>{t.extraRev}</button>
          </div>
          {undo.length > 0 && <button className="link" onClick={doUndo}>{t.undo}</button>}
          <button className="primary" onClick={onExit}>{t.back2}</button>
        </div>
      )}

      {editing && note && (
        <NoteEditor noteId={note.id} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
