"use client";

import Link from "next/link";
import { LangToggle, useLang } from "@/lib/i18n";

/** 첫 화면: 과목 고르기 */
export default function Hub() {
  const { lang } = useLang();
  const ko = lang === "ko";
  return (
    <main className="hub">
      <div className="hub-top">
        <LangToggle />
      </div>
      <nav className="hub-list">
        <Link href="/math" className="hub-tile math">
          <span className="hub-icon" aria-hidden>∑</span>
          <span className="hub-text">
            <b>Math</b>
            <small>{ko ? "애플펜슬로 한 줄씩 풀고 바로 확인" : "Solve line by line with Apple Pencil"}</small>
          </span>
          <span className="hub-arrow" aria-hidden>›</span>
        </Link>
        <Link href="/cards" className="hub-tile spanish">
          <span className="hub-icon" aria-hidden>ñ</span>
          <span className="hub-text">
            <b>Spanish</b>
            <small>{ko ? "플래시카드 · 간격 반복 복습" : "Flashcards · spaced repetition"}</small>
          </span>
          <span className="hub-arrow" aria-hidden>›</span>
        </Link>
      </nav>
    </main>
  );
}
