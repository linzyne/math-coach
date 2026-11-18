"use client";

import { useMemo, useState } from "react";
import { dayNumber, deckFamily, nextDayStart } from "@/lib/cards/scheduler";
import { sortedDecks } from "@/lib/cards/collection";
import { useCards } from "./store";

const DAY = 86400000;

export default function Stats() {
  const { col, t, lang, version } = useCards();
  const [deckId, setDeckId] = useState<string>("all");

  const s = useMemo(() => {
    const now = Date.now();
    const today = dayNumber(now, col.settings.dayStartHour);
    const fam = deckId === "all" ? null : deckFamily(col, deckId);
    const cards = col.cards.filter((c) => !fam || fam.has(c.deckId));
    const ids = new Set(cards.map((c) => c.id));
    const logs = col.revlog.filter((r) => ids.has(r.cardId));
    const dayStart = nextDayStart(now, col.settings.dayStartHour) - DAY;
    const todayLogs = logs.filter((r) => r.time >= dayStart);

    const counts = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
    let easeSum = 0, easeN = 0, ivlSum = 0;
    for (const c of cards) {
      if (c.queue === "suspended") counts.suspended++;
      else if (c.state === "new") counts.new++;
      else if (c.state === "learning" || c.state === "relearning") counts.learning++;
      else if (c.interval >= 21) counts.mature++;
      else counts.young++;
      if (c.state === "review") { easeSum += c.ease; ivlSum += c.interval; easeN++; }
    }

    const forecast = Array.from({ length: 30 }, () => 0);
    for (const c of cards) {
      if (c.queue !== "review") continue;
      const d = Math.max(0, c.due - today);
      if (d < 30) forecast[d]++;
    }

    const recent = logs.filter((r) => r.time >= now - 30 * DAY && r.type === "review");
    const retention = recent.length ? recent.filter((r) => r.ease > 1).length / recent.length : null;

    // 최근 15주 활동 (요일 × 주)
    const WEEKS = 15;
    const perDay = new Map<number, number>();
    for (const r of logs) {
      const d = dayNumber(r.time, col.settings.dayStartHour);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    let streak = 0;
    for (let d = today - (perDay.has(today) ? 0 : 1); perDay.has(d); d--) streak++;
    const heat: { day: number; n: number }[] = [];
    // dayNumber는 UTC 1970-01-01(목)부터 센 값 → (d+4)%7 이 일요일 0
    const endDow = (today + 4) % 7;
    const start = today - (WEEKS - 1) * 7 - endDow;
    for (let d = start; d <= today; d++) heat.push({ day: d, n: perDay.get(d) ?? 0 });

    return {
      todayN: todayLogs.length,
      todayMin: Math.round(todayLogs.reduce((a, r) => a + r.durationMs, 0) / 60000),
      todayAgain: todayLogs.length ? todayLogs.filter((r) => r.ease === 1).length / todayLogs.length : 0,
      counts, total: cards.length, forecast, retention, heat, streak,
      avgEase: easeN ? easeSum / easeN : 0, avgIvl: easeN ? ivlSum / easeN : 0,
    };
  }, [col, deckId, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxF = Math.max(1, ...s.forecast);
  const maxH = Math.max(1, ...s.heat.map((h) => h.n));
  const pct = (x: number) => Math.round(x * 100) + "%";
  const bars: [keyof typeof s.counts, string, string][] = [
    ["new", t.stState.new, "var(--fc-new)"],
    ["learning", t.stState.learning, "var(--fc-learn)"],
    ["young", t.young, "var(--fc-young)"],
    ["mature", t.mature, "var(--fc-mature)"],
    ["suspended", t.queueSusp, "var(--fc-susp)"],
  ];

  return (
    <div className="fc-page">
      <header className="fc-head">
        <h1>{t.tabStats}</h1>
        <select className="fc-deck-pick" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
          <option value="all">{t.total}</option>
          {sortedDecks(col).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </header>

      <section className="fc-stat-card">
        <h3>{t.today}</h3>
        <p className="fc-stat-big">{s.todayN ? t.studiedToday(s.todayN, Math.max(1, s.todayMin)) : t.nothingToday}</p>
        {s.todayN > 0 && <p className="muted">{t.againPct}: {pct(s.todayAgain)}</p>}
        {s.streak > 0 && <p className="fc-streak">🔥 {t.streak(s.streak)}</p>}
      </section>

      <section className="fc-stat-card">
        <h3>{t.heat}</h3>
        <div className="fc-heat">
          {s.heat.map((h) => (
            <span key={h.day} title={`${h.n}`} style={{ opacity: h.n ? 0.25 + 0.75 * (h.n / maxH) : 1 }} className={h.n ? "on" : ""} />
          ))}
        </div>
      </section>

      <section className="fc-stat-card">
        <h3>{t.forecast}</h3>
        <div className="fc-forecast" role="img" aria-label={t.forecast}>
          {s.forecast.map((n, i) => (
            <div key={i} className="fc-fbar" title={`+${i}: ${n}`}>
              <span style={{ height: `${(n / maxF) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="fc-axis"><span>{t.today}</span><span>+15</span><span>+29</span></div>
      </section>

      <section className="fc-stat-card">
        <h3>{t.counts} <small className="muted">· {t.total} {s.total}</small></h3>
        <div className="fc-stack">
          {bars.map(([k, , color]) => s.counts[k] > 0 && <span key={k} style={{ flex: s.counts[k], background: color }} />)}
        </div>
        <ul className="fc-legend">
          {bars.map(([k, label, color]) => (
            <li key={k}><i style={{ background: color }} />{label}<b>{s.counts[k]}</b></li>
          ))}
        </ul>
      </section>

      <section className="fc-stat-card fc-stat-grid">
        <div><small>{t.retention}</small><b>{s.retention === null ? "–" : pct(s.retention)}</b></div>
        <div><small>{t.avgEase}</small><b>{s.avgEase ? pct(s.avgEase) : "–"}</b></div>
        <div><small>{t.avgIvl}</small><b>{s.avgIvl ? (lang === "ko" ? `${Math.round(s.avgIvl)}일` : `${Math.round(s.avgIvl)}d`) : "–"}</b></div>
      </section>
    </div>
  );
}
