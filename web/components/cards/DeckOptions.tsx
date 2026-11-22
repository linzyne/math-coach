"use client";

import { useState } from "react";
import type { Deck, DeckConfig } from "@/lib/cards/types";
import { useCards } from "./store";
import { deckFamily } from "@/lib/cards/scheduler";
import { setNoteType } from "@/lib/cards/collection";

export default function DeckOptions({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const { col, mutate, t, toast } = useCards();
  const fam = deckFamily(col, deck.id);
  const deckNotes = col.notes.filter((n) => col.cards.some((c) => c.noteId === n.id && fam.has(c.deckId)));
  const nBasic = deckNotes.filter((n) => n.type === "basic").length;
  const nRev = deckNotes.filter((n) => n.type === "reversed").length;
  const changeType = (type: "basic" | "reversed") => {
    const ids = new Set(deckNotes.map((n) => n.id));
    if (type === "basic" && !confirm(t.dirToBasicConfirm(nRev))) return;
    let n = 0;
    mutate((c) => { n = setNoteType(c, ids, type); });
    toast(type === "reversed" ? t.dirToRevDone(n) : t.dirToBasicDone(n));
  };
  const [c, setC] = useState<DeckConfig>({ ...deck.config });
  const [steps, setSteps] = useState(deck.config.learningSteps.join(" "));
  const [relearn, setRelearn] = useState(deck.config.relearningSteps.join(" "));
  const [all, setAll] = useState(false);

  const parseSteps = (s: string) => s.split(/[\s,]+/).map(Number).filter((x) => x > 0);
  const num = (key: keyof DeckConfig, label: string, pct = false, min = 0) => (
    <label className="fc-opt">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        value={pct ? Math.round((c[key] as number) * 100) : (c[key] as number)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          setC({ ...c, [key]: pct ? v / 100 : v });
        }}
      />
    </label>
  );

  const save = () => {
    const cfg: DeckConfig = {
      ...c,
      learningSteps: parseSteps(steps),
      relearningSteps: parseSteps(relearn),
      startingEase: Math.max(1.3, c.startingEase),
      newPerDay: Math.max(0, Math.round(c.newPerDay)),
      reviewsPerDay: Math.max(0, Math.round(c.reviewsPerDay)),
      graduatingInterval: Math.max(1, Math.round(c.graduatingInterval)),
      easyInterval: Math.max(1, Math.round(c.easyInterval)),
      maxInterval: Math.max(1, Math.round(c.maxInterval)),
    };
    mutate((col) => {
      for (const d of col.decks) if (all || d.id === deck.id) d.config = { ...cfg, learningSteps: [...cfg.learningSteps], relearningSteps: [...cfg.relearningSteps] };
    });
    toast(t.saved);
    onClose();
  };

  return (
    <div className="fc-sheet-bg">
      <div className="fc-sheet" role="dialog" aria-modal="true">
        <header className="fc-sheet-head">
          <button className="link" onClick={onClose}>{t.cancel}</button>
          <b className="fc-ellipsis">{t.optTitle(deck.name.split("::").pop() ?? "")}</b>
          <button className="link strong" onClick={save}>{t.save}</button>
        </header>
        <div className="fc-sheet-body fc-opts">
          {(nBasic > 0 || nRev > 0) && (
            <>
              <h3>{t.dirTitle}</h3>
              <section>
                <div className="fc-opt"><span>{t.dirBasic}</span><b>{nBasic}</b></div>
                <div className="fc-opt"><span>{t.dirRev}</span><b>{nRev}</b></div>
                {nBasic > 0 && <button className="fc-opt-btn" onClick={() => changeType("reversed")}>⇄ {t.dirToRev(nBasic)}</button>}
                {nRev > 0 && <button className="fc-opt-btn danger" onClick={() => changeType("basic")}>→ {t.dirToBasic(nRev)}</button>}
              </section>
              <p className="fc-help fc-dir-help">{t.dirHelp}</p>
              <h3>{t.optStudy}</h3>
            </>
          )}
          <section>
            {num("newPerDay", t.optNewDay)}
            {num("reviewsPerDay", t.optRevDay)}
          </section>
          <section>
            <label className="fc-opt"><span>{t.optSteps}</span><input value={steps} onChange={(e) => setSteps(e.target.value)} inputMode="numeric" /></label>
            {num("graduatingInterval", t.optGrad, false, 1)}
            {num("easyInterval", t.optEasyIvl, false, 1)}
            <label className="fc-opt">
              <span>{t.optOrder}</span>
              <select value={c.newOrder} onChange={(e) => setC({ ...c, newOrder: e.target.value as DeckConfig["newOrder"] })}>
                <option value="added">{t.orderAdded}</option>
                <option value="random">{t.orderRandom}</option>
              </select>
            </label>
          </section>
          <section>
            <label className="fc-opt"><span>{t.optRelearn}</span><input value={relearn} onChange={(e) => setRelearn(e.target.value)} inputMode="numeric" /></label>
            {num("lapseNewInterval", t.optLapseIvl, true)}
            {num("leechThreshold", t.optLeech, false, 1)}
          </section>
          <section>
            {num("startingEase", t.optStartEase, true, 130)}
            {num("easyBonus", t.optEasyBonus, true, 100)}
            {num("hardInterval", t.optHardIvl, true, 100)}
            {num("intervalModifier", t.optIvlMod, true, 10)}
            {num("maxInterval", t.optMaxIvl, false, 1)}
          </section>
          <section>
            <label className="fc-opt check"><span>{t.optBury}</span><input type="checkbox" checked={c.buryNewSiblings} onChange={(e) => setC({ ...c, buryNewSiblings: e.target.checked })} /></label>
            <label className="fc-opt check"><span>{t.applyAll}</span><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /></label>
          </section>
        </div>
      </div>
    </div>
  );
}
