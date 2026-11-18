"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CardsProvider, useCards } from "./store";
import DeckList from "./DeckList";
import Study from "./Study";
import NoteEditor from "./NoteEditor";
import Browse from "./Browse";
import Stats from "./Stats";

type Tab = "decks" | "add" | "browse" | "stats";

function Shell() {
  const { t, mutate } = useCards();
  const [tab, setTab] = useState<Tab>("decks");
  const [studying, setStudying] = useState<string | null>(null);

  // 아이폰 뒤로 스와이프·뒤로 버튼으로 공부 화면 닫기
  useEffect(() => {
    const onPop = () => setStudying(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const startStudy = (deckId: string) => {
    mutate((c) => { c.settings.lastDeckId = deckId; });
    history.pushState({ study: deckId }, "");
    setStudying(deckId);
  };
  const exitStudy = () => {
    if (history.state?.study) history.back();
    else setStudying(null);
  };

  if (studying) return <div className="fc"><Study deckId={studying} onExit={exitStudy} /></div>;

  const tabs: [Tab, string, string][] = [
    ["decks", "🗂️", t.tabDecks],
    ["add", "＋", t.tabAdd],
    ["browse", "🔍", t.tabBrowse],
    ["stats", "📊", t.tabStats],
  ];

  return (
    <div className="fc">
      <Link href="/" className="fc-home">{t.home}</Link>
      <main className="fc-main">
        {tab === "decks" && <DeckList onStudy={startStudy} />}
        {tab === "add" && <NoteEditor asPage />}
        {tab === "browse" && <Browse />}
        {tab === "stats" && <Stats />}
      </main>
      <nav className="fc-tabbar">
        {tabs.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} aria-current={tab === k}>
            <span className="fc-tab-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function CardsApp() {
  return (
    <CardsProvider>
      <Shell />
    </CardsProvider>
  );
}
