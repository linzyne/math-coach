"use client";

import { useMemo, useRef, useState } from "react";
import type { NoteType } from "@/lib/cards/types";
import { download, exportJson, exportTsv, importRows, parseBackup, parseDelimited } from "@/lib/cards/io";
import { sortedDecks } from "@/lib/cards/collection";
import { LangToggle } from "@/lib/i18n";
import { useCards } from "./store";

export default function DataPanel({ onClose }: { onClose: () => void }) {
  const { col, mutate, replace, t, toast } = useCards();
  const [text, setText] = useState("");
  const [deckName, setDeckName] = useState(col.decks.find((d) => d.id === col.settings.lastDeckId)?.name ?? sortedDecks(col)[0].name);
  const [type, setType] = useState<NoteType | "auto">("auto");
  const [hasTags, setHasTags] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => (text.trim() ? parseDelimited(text) : []), [text]);
  const s = col.settings;

  const setSetting = (patch: Partial<typeof s>) => mutate((c) => { c.settings = { ...c.settings, ...patch }; });
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="fc-sheet-bg">
      <div className="fc-sheet" role="dialog" aria-modal="true">
        <header className="fc-sheet-head">
          <span />
          <b>{t.general}</b>
          <button className="link strong" onClick={onClose}>{t.close}</button>
        </header>
        <div className="fc-sheet-body fc-opts">
          <section>
            <div className="fc-opt"><span>Language</span><LangToggle /></div>
            <label className="fc-opt">
              <span>{t.dayStart}</span>
              <select value={s.dayStartHour} onChange={(e) => setSetting({ dayStartHour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </label>
            <label className="fc-opt check"><span>{t.showIvl}</span><input type="checkbox" checked={s.showIntervals} onChange={(e) => setSetting({ showIntervals: e.target.checked })} /></label>
            <label className="fc-opt check"><span>{t.showRemain}</span><input type="checkbox" checked={s.showRemaining} onChange={(e) => setSetting({ showRemaining: e.target.checked })} /></label>
          </section>

          <h3>{t.dataTitle}</h3>
          <section>
            <button className="fc-opt-btn" onClick={() => download(`flashcards-${stamp}.json`, exportJson(col), "application/json")}>⤓ {t.backup}</button>
            <button className="fc-opt-btn" onClick={() => backupRef.current?.click()}>⤒ {t.restore}</button>
            <button className="fc-opt-btn" onClick={() => download(`flashcards-${stamp}.txt`, exportTsv(col, null))}>⤓ {t.exportAll}</button>
            <input ref={backupRef} type="file" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const next = parseBackup(await f.text());
                if (confirm(t.restoreConfirm)) { replace(next); toast(t.restored); }
              } catch { toast(t.badFile); }
            }} />
          </section>

          <h3>{t.importText}</h3>
          <p className="fc-help">{t.importHelp}</p>
          <textarea className="fc-import" rows={5} placeholder={t.importPaste} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="fc-row2">
            <button className="ghost" onClick={() => fileRef.current?.click()}>{t.chooseFile}</button>
            <input ref={fileRef} type="file" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setText(await f.text());
            }} />
            <label className="fc-field inline"><input type="checkbox" checked={hasTags} onChange={(e) => setHasTags(e.target.checked)} /> {t.hasTags}</label>
          </div>
          {rows.length > 0 && (
            <>
              <div className="fc-row2">
                <label className="fc-field"><span>{t.deck}</span>
                  <input list="fc-decks-imp" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
                  <datalist id="fc-decks-imp">{sortedDecks(col).map((d) => <option key={d.id} value={d.name} />)}</datalist>
                </label>
                <label className="fc-field"><span>{t.type}</span>
                  <select value={type} onChange={(e) => setType(e.target.value as NoteType | "auto")}>
                    <option value="auto">{t.importType}</option>
                    <option value="basic">{t.typeBasic}</option>
                    <option value="reversed">{t.typeReversed}</option>
                    <option value="cloze">{t.typeCloze}</option>
                  </select>
                </label>
              </div>
              <ul className="fc-import-preview">
                {rows.slice(0, 3).map((r, i) => <li key={i}><b>{r[0]}</b> → {r[1]}{hasTags && r[2] ? <em> #{r[2]}</em> : null}</li>)}
              </ul>
              <button className="primary" onClick={() => {
                let n = 0;
                mutate((c) => { n = importRows(c, rows, deckName, type, hasTags); });
                toast(t.imported(n));
                setText("");
              }}>{t.importDo(rows.length)}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
