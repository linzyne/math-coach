"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Tex from "./Tex";
import AddProblem from "./AddProblem";
import { PROBLEMS } from "@/lib/problems";
import { LangToggle, useLang } from "@/lib/i18n";
import { loadCustom, removeCustom, type CustomProblem } from "@/lib/customProblems";

export default function HomeList() {
  const { t } = useLang();
  const [custom, setCustom] = useState<CustomProblem[]>([]);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setCustom(loadCustom()), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <main className="home">
      <div className="home-top">
        <h1>{t.appTitle}</h1>
        <LangToggle />
      </div>
      <p className="sub">{t.appSub}</p>
      <button className="primary add-btn" onClick={() => setAdding(true)}>{t.addProblem}</button>

      {custom.length > 0 && (
        <>
          <h2 className="section-title">{t.myProblems}</h2>
          <ol className="plist">
            {custom.map((p, i) => (
              <li key={p.id} className="pcard-row">
                <Link href={`/solve/custom?id=${p.id}`} className="pcard">
                  <span className="pnum mine">{i + 1}</span>
                  <span className="ptex"><Tex tex={p.latex} /></span>
                </Link>
                <button
                  className="pdel"
                  aria-label={t.del}
                  onClick={() => {
                    if (!confirm(t.delConfirm)) return;
                    removeCustom(p.id);
                    setCustom(loadCustom());
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ol>
          <h2 className="section-title">{t.samples}</h2>
        </>
      )}

      <ol className="plist">
        {PROBLEMS.map((p, i) => (
          <li key={p.id}>
            <Link href={`/solve/${p.id}`} className="pcard">
              <span className="pnum">{i + 1}</span>
              <span className="ptex"><Tex tex={p.latex} /></span>
              <span className={`plevel l${p.level}`}>{t.levels[p.title]}</span>
            </Link>
          </li>
        ))}
      </ol>

      {adding && (
        <AddProblem
          onClose={() => setAdding(false)}
          onAdded={(n) => {
            setAdding(false);
            setCustom(loadCustom());
            setToast(t.added(n));
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
