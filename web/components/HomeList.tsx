"use client";

import Link from "next/link";
import Tex from "./Tex";
import { PROBLEMS } from "@/lib/problems";
import { LangToggle, useLang } from "@/lib/i18n";

export default function HomeList() {
  const { t } = useLang();
  return (
    <main className="home">
      <div className="home-top">
        <h1>{t.appTitle}</h1>
        <LangToggle />
      </div>
      <p className="sub">{t.appSub}</p>
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
    </main>
  );
}
