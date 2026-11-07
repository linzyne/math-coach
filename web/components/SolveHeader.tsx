"use client";

import Link from "next/link";
import Tex from "./Tex";
import { LangToggle, useLang } from "@/lib/i18n";

export default function SolveHeader({ no, latex }: { no: number; latex: string }) {
  const { t } = useLang();
  return (
    <header className="solve-head">
      <Link href="/" className="back">{t.back}</Link>
      <div className="problem">
        <span className="problem-no">{t.problemNo(no)}</span>
        <Tex tex={latex} display />
      </div>
      <span className="hint-hint">{t.writeTip}</span>
      <LangToggle />
    </header>
  );
}
