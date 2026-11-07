"use client";

import { useEffect, useRef, useState } from "react";
import Tex from "./Tex";
import { useLang } from "@/lib/i18n";
import { addCustom, imageToBase64, parsePasted } from "@/lib/customProblems";

type Item = { latex: string; status: "checking" | "ok" | "bad"; reason?: string; solution?: string; selected: boolean };

async function check(latex: string): Promise<Pick<Item, "status" | "reason" | "solution">> {
  try {
    const r = await fetch("/api/py/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latex }) });
    const d = await r.json();
    return d.ok ? { status: "ok", solution: d.solution } : { status: "bad", reason: d.reason ?? "parse" };
  } catch {
    return { status: "bad", reason: "parse" };
  }
}

export default function AddProblem({ onClose, onAdded }: { onClose: () => void; onAdded: (n: number) => void }) {
  const { t } = useLang();
  const [tab, setTab] = useState<"photo" | "paste">("photo");
  const [paste, setPaste] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const review = async (list: string[]) => {
    if (list.length === 0) {
      setMsg(t.noneFound);
      return;
    }
    setMsg(null);
    setItems(list.map((latex) => ({ latex, status: "checking", selected: true })));
    const results = await Promise.all(list.map(check));
    setItems(list.map((latex, i) => ({ latex, ...results[i], selected: results[i].status === "ok" })));
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const image = await imageToBase64(file);
      const r = await fetch("/api/read-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, mediaType: "image/jpeg" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg((t.apiErrors[d.error ?? "unknown"] ?? t.hintFail) + (d.detail ? ` (${d.detail})` : ""));
      else await review(d.problems ?? []);
    } catch {
      setMsg(t.netError);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const edit = (i: number, latex: string) => {
    setItems((cur) => cur && cur.map((it, j) => (j === i ? { ...it, latex, status: "checking" } : it)));
    clearTimeout(timers.current.get(i));
    timers.current.set(
      i,
      setTimeout(async () => {
        const res = await check(latex);
        setItems((cur) => cur && cur.map((it, j) => (j === i && it.latex === latex ? { ...it, ...res, selected: res.status === "ok" } : it)));
      }, 500),
    );
  };

  const chosen = (items ?? []).filter((it) => it.selected && it.status === "ok");

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal add-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.addTitle}>
        <div className="solution-head">
          <h2>{t.addTitle}</h2>
          <button className="hint-close" onClick={onClose} aria-label={t.close}>✕</button>
        </div>

        {items === null ? (
          <>
            <div className="seg add-tabs">
              <button className={tab === "photo" ? "on" : ""} onClick={() => setTab("photo")}>{t.tabPhoto}</button>
              <button className={tab === "paste" ? "on" : ""} onClick={() => setTab("paste")}>{t.tabPaste}</button>
            </div>
            {tab === "photo" ? (
              <div className="add-pane">
                <p className="modal-help">{t.photoHelp}</p>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
                <button className="primary big" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy ? t.reading : t.choosePhoto}
                </button>
              </div>
            ) : (
              <div className="add-pane">
                <p className="modal-help">{t.pasteHelp}</p>
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={t.pastePlaceholder}
                  rows={5}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button className="primary" onClick={() => review(parsePasted(paste))} disabled={!paste.trim()}>
                  {t.findProblems}
                </button>
              </div>
            )}
            {msg && <p className="hint-sub ask-err">{msg}</p>}
          </>
        ) : (
          <>
            <p className="modal-help">{t.review}</p>
            <ul className="review-list">
              {items.map((it, i) => (
                <li key={i} className={`review-item ${it.status}`}>
                  <label className="review-check">
                    <input
                      type="checkbox"
                      checked={it.selected && it.status === "ok"}
                      disabled={it.status !== "ok"}
                      onChange={(e) => setItems((cur) => cur && cur.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                    />
                  </label>
                  <div className="review-body">
                    <div className="review-tex"><Tex tex={it.latex} /></div>
                    <input value={it.latex} onChange={(e) => edit(i, e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                    <span className="review-status">
                      {it.status === "checking" ? t.checking : it.status === "ok" ? `✓ ${t.okSol}` : `⚠ ${t.reasons[it.reason ?? "parse"]}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setItems(null)}>{t.back}</button>
              <span style={{ flex: 1 }} />
              <button
                className="primary"
                disabled={chosen.length === 0}
                onClick={() => {
                  addCustom(chosen.map((c) => c.latex));
                  onAdded(chosen.length);
                }}
              >
                {t.addN(chosen.length)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
