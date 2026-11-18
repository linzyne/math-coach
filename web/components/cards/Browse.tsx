"use client";

import { useMemo, useState } from "react";
import { searchCards } from "@/lib/cards/search";
import { plainText } from "@/lib/cards/render";
import { dayNumber, formatSecs } from "@/lib/cards/scheduler";
import { deleteNotes, ensureDeck, moveCards, resetCards, setSuspended, sortedDecks } from "@/lib/cards/collection";
import type { Card, Note } from "@/lib/cards/types";
import { useCards } from "./store";
import NoteEditor from "./NoteEditor";
import CardFace from "./CardFace";
import { ActionSheet, NameSheet } from "./DeckList";

const FLAG_COLORS = ["", "#e5484d", "#f08c00", "#30a46c", "#3e63dd"];

export default function Browse({ initialQuery = "" }: { initialQuery?: string }) {
  const { col, mutate, t, lang, version } = useCards();
  const [q, setQ] = useState(initialQuery);
  const [help, setHelp] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [actions, setActions] = useState(false);
  const [moving, setMoving] = useState(false);
  const now = Date.now();
  const today = dayNumber(now, col.settings.dayStartHour);

  const results = useMemo(() => {
    const r = searchCards(col, q, now);
    r.sort((a, b) => b.note.created - a.note.created || a.card.ord - b.card.ord);
    return r;
  }, [col, q, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const deckName = (id: string) => col.decks.find((d) => d.id === id)?.name ?? "";
  const dueText = (c: Card) => {
    if (c.queue === "suspended") return t.queueSusp;
    if (c.queue === "buried") return t.queueBuried;
    if (c.state === "new") return t.stState.new;
    if (c.queue === "learning") return formatSecs(Math.max(0, (c.due - now) / 1000), lang);
    const d = c.due - today;
    return d <= 0 ? t.today : formatSecs(d * 86400, lang);
  };

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selNotes = () => new Set(col.cards.filter((c) => sel.has(c.id)).map((c) => c.noteId));
  const done = () => { setSel(new Set()); setSelecting(false); setActions(false); };

  const openItem = open ? results.find((r) => r.card.id === open) ?? null : null;

  return (
    <div className="fc-page">
      <header className="fc-head">
        <h1>{t.tabBrowse}</h1>
        <button className="link" onClick={() => { setSelecting((s) => !s); setSel(new Set()); }}>{selecting ? t.cancel : "☑︎"}</button>
      </header>
      <div className="fc-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} autoCapitalize="off" autoCorrect="off" enterKeyHint="search" />
        <button className="fc-iconbtn sm" onClick={() => setHelp((h) => !h)} aria-label={t.searchHelp}>?</button>
      </div>
      <div className="fc-chips">
        {["is:due", "is:new", "is:suspended", "flag:1", "added:1", "rated:1", "tag:leech"].map((c) => (
          <button key={c} className={q.includes(c) ? "on" : ""} onClick={() => setQ((x) => (x.includes(c) ? x.replace(c, "").trim() : (x + " " + c).trim()))}>{c}</button>
        ))}
      </div>
      {help && (
        <table className="fc-syntax"><tbody>
          {t.searchSyntax.map(([k, v]) => <tr key={k}><td><code>{k}</code></td><td>{v}</td></tr>)}
        </tbody></table>
      )}
      <div className="fc-result-meta">
        <span>{t.nCards(results.length)}</span>
        {selecting && (
          <button className="link" onClick={() => setSel(sel.size === results.length ? new Set() : new Set(results.map((r) => r.card.id)))}>{t.selectAll}</button>
        )}
      </div>

      <ul className="fc-results">
        {results.slice(0, 500).map(({ card, note }) => (
          <li key={card.id} className={card.queue === "suspended" ? "susp" : ""}>
            <button onClick={() => (selecting ? toggle(card.id) : setOpen(card.id))}>
              {selecting && <span className={`fc-check ${sel.has(card.id) ? "on" : ""}`}>{sel.has(card.id) ? "✓" : ""}</span>}
              <span className="fc-res-main">
                <span className="fc-res-q">
                  {card.flag > 0 && <span style={{ color: FLAG_COLORS[card.flag] }}>⚑ </span>}
                  {plainText(note.type === "reversed" && card.ord === 1 ? note.fields.back : note.fields.front)}
                  {note.type === "cloze" && <em> c{card.ord + 1}</em>}
                </span>
                <span className="fc-res-sub">{deckName(card.deckId)}{note.tags.length ? " · #" + note.tags.join(" #") : ""}</span>
              </span>
              <span className="fc-res-due">{dueText(card)}</span>
            </button>
          </li>
        ))}
      </ul>

      {selecting && sel.size > 0 && (
        <div className="fc-selbar">
          <span>{t.selected(sel.size)}</span>
          <button className="primary" onClick={() => setActions(true)}>{t.more}</button>
        </div>
      )}

      {actions && (
        <ActionSheet title={t.selected(sel.size)} onClose={() => setActions(false)}>
          <button onClick={() => { setActions(false); setMoving(true); }}>📂 {t.changeDeck}</button>
          <button onClick={() => { mutate((c) => setSuspended(c, sel, true)); done(); }}>⏸ {t.suspend}</button>
          <button onClick={() => { mutate((c) => setSuspended(c, sel, false)); done(); }}>▶︎ {t.unsuspend}</button>
          <button onClick={() => { mutate((c) => { for (const x of c.cards) if (sel.has(x.id)) x.flag = x.flag === 1 ? 0 : 1; }); done(); }}>⚑ {t.flag}</button>
          <button onClick={() => { if (confirm(t.resetConfirm)) mutate((c) => resetCards(c, sel)); done(); }}>↺ {t.reset}</button>
          <button className="danger" onClick={() => { const ns = selNotes(); if (confirm(t.delCardsConfirm(ns.size))) mutate((c) => deleteNotes(c, ns)); done(); }}>🗑 {t.del}</button>
        </ActionSheet>
      )}

      {moving && (
        <NameSheet
          title={t.changeDeck}
          help={t.deckName}
          initial=""
          suggestions={sortedDecks(col).map((d) => d.name)}
          onSave={(name) => { mutate((c) => moveCards(c, sel, ensureDeck(c, name).id)); setMoving(false); done(); }}
          onClose={() => setMoving(false)}
        />
      )}

      {openItem && !editNote && (
        <CardDetail card={openItem.card} note={openItem.note} onClose={() => setOpen(null)} onEdit={() => setEditNote(openItem.note.id)} />
      )}
      {editNote && <NoteEditor noteId={editNote} onClose={() => setEditNote(null)} />}
    </div>
  );
}

function CardDetail({ card, note, onClose, onEdit }: { card: Card; note: Note; onClose: () => void; onEdit: () => void }) {
  const { col, mutate, t, lang } = useCards();
  const [back, setBack] = useState(false);
  const logs = col.revlog.filter((r) => r.cardId === card.id).slice(-20).reverse();
  const today = dayNumber(Date.now(), col.settings.dayStartHour);
  const easeName = [t.again, t.again, t.hard, t.good, t.easy];
  return (
    <div className="fc-sheet-bg">
      <div className="fc-sheet" role="dialog" aria-modal="true">
        <header className="fc-sheet-head">
          <button className="link" onClick={onClose}>{t.close}</button>
          <b>{t.cardInfo}</b>
          <button className="link strong" onClick={onEdit}>{t.edit}</button>
        </header>
        <div className="fc-sheet-body">
          <div className="fc-preview" onClick={() => setBack((b) => !b)}>
            <CardFace note={note} card={card} showBack={back} media={col.media} />
            <span className="fc-preview-tip">{t.flip} ↻</span>
          </div>
          <dl className="fc-info">
            <dt>{t.deck}</dt><dd>{col.decks.find((d) => d.id === card.deckId)?.name}</dd>
            <dt>{t.type}</dt><dd>{t.stState[card.state]}{card.queue === "suspended" ? ` · ${t.queueSusp}` : card.queue === "buried" ? ` · ${t.queueBuried}` : ""}</dd>
            {card.state === "review" && <><dt>{t.due}</dt><dd>{card.due - today <= 0 ? t.today : formatSecs((card.due - today) * 86400, lang)}</dd></>}
            <dt>{t.interval}</dt><dd>{card.interval ? formatSecs(card.interval * 86400, lang) : "–"}</dd>
            <dt>{t.ease}</dt><dd>{card.state === "new" ? "–" : Math.round(card.ease * 100) + "%"}</dd>
            <dt>{t.reviews}</dt><dd>{card.reps}</dd>
            <dt>{t.lapses}</dt><dd>{card.lapses}</dd>
          </dl>
          <div className="fc-row-btns">
            <button className="ghost" onClick={() => mutate((c) => setSuspended(c, new Set([card.id]), card.queue !== "suspended"))}>{card.queue === "suspended" ? t.unsuspend : t.suspend}</button>
            <button className="ghost" onClick={() => { if (confirm(t.resetConfirm)) mutate((c) => resetCards(c, new Set([card.id]))); }}>{t.reset}</button>
          </div>
          {logs.length > 0 && (
            <>
              <h3>{t.history}</h3>
              <table className="fc-log"><tbody>
                {logs.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.time).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" })}</td>
                    <td className={`e${r.ease}`}>{easeName[r.ease]}</td>
                    <td>{r.interval < 0 ? formatSecs(-r.interval, lang) : formatSecs(r.interval * 86400, lang)}</td>
                    <td>{t.stState[r.type]}</td>
                  </tr>
                ))}
              </tbody></table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
