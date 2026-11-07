"use client";

import Link from "next/link";
import MathText from "./MathText";
import { LangToggle, useLang } from "@/lib/i18n";

export default function SolveHeader({ no, statement, kind }: { no: number; statement: string; kind: "solve" | "free" }) {
  const { t } = useLang();
  return (
    <header className={`solve-head ${kind === "free" ? "free" : ""}`}>
      <Link href="/" className="back">{t.back}</Link>
      <div className="problem">
        <span className="problem-no">{t.problemNo(no)}</span>
        <MathText text={statement} className="problem-text" />
      </div>
      <span className="hint-hint">{kind === "free" ? t.writeTipFree : t.writeTip}</span>
      <LangToggle />
    </header>
  );
}
