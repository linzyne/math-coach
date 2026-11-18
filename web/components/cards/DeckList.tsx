"use client";

import { useMemo, useState } from "react";
import type { Deck } from "@/lib/cards/types";
import { deckCounts } from "@/lib/cards/scheduler";
import { deleteDeck, ensureDeck, renameDeck, sortedDecks } from "@/lib/cards/collection";
import { download, exportTsv } from "@/lib/cards/io";
import { deckFamily } from "@/lib/cards/scheduler";
import { useCards } from "./store";
import DeckOptions from "./DeckOptions";
import DataPanel, { ImportSheet } from "./DataPanel";
import { addSampleDeck } from "@/lib/cards/sample";

export default function DeckList({ onStudy }: { onStudy: (deckId: string) => void }) {
  const { col, mutate, t, lang, toast, version, account } = useCards();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [data, setData] = useState(false);
  const now = Date.now();

  const rows = useMemo(() => {
    const decks = sortedDecks(col);
    return decks
      .filter((d) => {
        const parts = d.name.split("::");
        for (let i = 1; i < parts.length; i++) {
          const parent = decks.find((x) => x.name === parts.slice(0, i).join("::"));
          if (parent && collapsed.has(parent.id)) return false;
        }
        // 카드가 없는 Default 덱은 다른 덱이 있으면 숨김 (앙키처럼)
        if (d.name === "Default" && decks.length > 1 && !col.cards.some((c) => c.deckId === d.id)) return false;
        return true;
      })
      .map((d) => ({
        deck: d,
        depth: d.name.split("::").length - 1,
        hasChildren: decks.some((x) => x.name.startsWith(d.name + "::")),
        counts: deckCounts(col, d.id, now),
        total: col.cards.filter((c) => deckFamily(col, d.id).has(c.deckId)).length,
      }));
  }, [col, version, collapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const [importTo, setImportTo] = useState<string | null>(null); // 덱 이름
  const [naming, setNaming] = useState<null | { kind: "new" } | { kind: "rename"; id: string; name: string }>(null);
  const cleanName = (n: string) => n.split("::").map((x) => x.trim()).filter(Boolean).join("::");
  const saveName = (name: string) => {
    const n = cleanName(name);
    const job = naming;
    setNaming(null);
    if (!n || !job) return;
    if (job.kind === "new") {
      // 새 덱을 만들면 카드 추가·가져오기의 기본 덱도 그 덱으로
      mutate((c) => { const d = ensureDeck(c, n); c.settings.lastDeckId = d.id; });
      toast(t.deckCreated(n));
    } else if (n !== job.name) {
      mutate((c) => renameDeck(c, job.id, n));
    }
  };

  const menuDeck = col.decks.find((d) => d.id === menuFor);
  const empty = col.cards.length === 0;
  // 카드가 없어도 직접 만든 덱은 보여 준다
  const showList = rows.some((r) => r.deck.name !== "Default" || r.total > 0);

  return (
    <div className="fc-page">
      <header className="fc-head">
        <h1>{t.title}</h1>
        <div className="fc-head-actions">
          {account.email && <span className={`fc-cloud s-${account.status}`} title={t.syncState[account.status]}>☁︎</span>}
          <button className="fc-iconbtn" onClick={() => setData(true)} aria-label={t.dataTitle}>⚙︎</button>
        </div>
      </header>


      {empty && (
        <div className="fc-empty">
          <p className="fc-empty-icon">🗂️</p>
          <p>{t.emptyDecks}</p>
          <button className="ghost" onClick={() => { mutate((c) => addSampleDeck(c, lang)); toast(t.sampleAdded); }}>{t.sampleDeck}</button>
        </div>
      )}

      {showList && (
        <div className="fc-decks">
          <div className="fc-deck-cols" aria-hidden>
            <span />
            <span className="c-new">{t.newLbl}</span>
            <span className="c-learn">{t.learnLbl}</span>
            <span className="c-due">{t.dueLbl}</span>
            <span />
          </div>
          {rows.map(({ deck, depth, hasChildren, counts, total }) => (
            <div key={deck.id} className="fc-deck-row" style={{ paddingLeft: 8 + depth * 18 }}>
              <button className="fc-deck-main" onClick={() => (total === 0 ? setImportTo(deck.name) : onStudy(deck.id))}>
                {hasChildren ? (
                  <span
                    className="fc-caret"
                    role="button"
                    aria-label="toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((s) => { const n = new Set(s); if (n.has(deck.id)) n.delete(deck.id); else n.add(deck.id); return n; });
                    }}
                  >
                    {collapsed.has(deck.id) ? "▸" : "▾"}
                  </span>
                ) : <span className="fc-caret" />}
                <span className="fc-deck-name">
                  {deck.name.split("::").pop()}
                  {total === 0 ? <small className="empty">{t.emptyDeckHint}</small> : <small>{t.nCards(total)}</small>}
                </span>
              </button>
              <span className={`fc-num c-new ${counts.newCount ? "" : "zero"}`}>{counts.newCount}</span>
              <span className={`fc-num c-learn ${counts.learnCount ? "" : "zero"}`}>{counts.learnCount}</span>
              <span className={`fc-num c-due ${counts.reviewCount ? "" : "zero"}`}>{counts.reviewCount}</span>
              <button className="fc-iconbtn sm" onClick={() => setMenuFor(deck.id)} aria-label={t.options}>⋯</button>
            </div>
          ))}
        </div>
      )}

      <button className="ghost fc-wide" onClick={() => setNaming({ kind: "new" })}>{t.createDeck}</button>

      {menuDeck && (
        <ActionSheet onClose={() => setMenuFor(null)} title={menuDeck.name}>
          <button onClick={() => { setMenuFor(null); onStudy(menuDeck.id); }}>▶︎ {t.studyNow}</button>
          <button onClick={() => { setMenuFor(null); setImportTo(menuDeck.name); }}>📄 {t.importToDeck}</button>
          <button onClick={() => { setMenuFor(null); setOptionsFor(menuDeck.id); }}>⚙︎ {t.options}</button>
          <button onClick={() => { setMenuFor(null); setNaming({ kind: "rename", id: menuDeck.id, name: menuDeck.name }); }}>✏️ {t.rename}</button>
          <button onClick={() => { setMenuFor(null); download(`${menuDeck.name.replace(/::/g, "-")}.txt`, exportTsv(col, deckFamily(col, menuDeck.id))); }}>⤓ {t.exportDeck}</button>
          <button className="danger" onClick={() => {
            const n = col.cards.filter((c) => deckFamily(col, menuDeck.id).has(c.deckId)).length;
            setMenuFor(null);
            if (confirm(t.delDeckConfirm(menuDeck.name, n))) mutate((c) => deleteDeck(c, menuDeck.id));
          }}>🗑 {t.del}</button>
        </ActionSheet>
      )}
      {optionsFor && <DeckOptions deck={col.decks.find((d) => d.id === optionsFor) as Deck} onClose={() => setOptionsFor(null)} />}
      {data && <DataPanel onClose={() => setData(false)} />}
      {importTo && <ImportSheet deckName={importTo} onClose={() => setImportTo(null)} />}
      {naming && (
        <NameSheet
          title={naming.kind === "new" ? t.createDeck.replace(/^＋\s*/, "") : t.rename}
          help={t.deckName}
          initial={naming.kind === "rename" ? naming.name : ""}
          onSave={saveName}
          onClose={() => setNaming(null)}
        />
      )}
    </div>
  );
}

/** 이름 하나를 입력받는 창 (아이폰 기본 prompt 대신) */
export function NameSheet({ title, help, initial, suggestions, onSave, onClose }: { title: string; help?: string; initial: string; suggestions?: string[]; onSave: (v: string) => void; onClose: () => void }) {
  const { t } = useCards();
  const [v, setV] = useState(initial);
  return (
    <div className="fc-sheet-bg fc-center" onClick={onClose}>
      <form className="fc-dialog" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSave(v); }}>
        <b>{title}</b>
        {help && <p className="fc-help">{help}</p>}
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} list={suggestions ? "fc-name-sugg" : undefined} autoCapitalize="off" autoCorrect="off" enterKeyHint="done" />
        {suggestions && <datalist id="fc-name-sugg">{suggestions.map((x) => <option key={x} value={x} />)}</datalist>}
        <div className="fc-dialog-btns">
          <button type="button" className="ghost" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="primary" disabled={!v.trim()}>{t.ok}</button>
        </div>
      </form>
    </div>
  );
}

export function ActionSheet({ title, children, onClose }: { title?: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useCards();
  return (
    <div className="fc-sheet-bg" onClick={onClose}>
      <div className="fc-action" onClick={(e) => e.stopPropagation()} role="menu">
        {title && <div className="fc-action-title">{title}</div>}
        <div className="fc-action-list">{children}</div>
        <button className="fc-action-cancel" onClick={onClose}>{t.cancel}</button>
      </div>
    </div>
  );
}
