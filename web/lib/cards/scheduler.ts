// 앙키 v2/v3 방식의 SM-2 변형 스케줄러.
import type { Card, Collection, Deck, DeckConfig, Ease, ReviewLog } from "./types";
import { uid } from "./types";

const DAY = 86400000;
const MIN = 60000;

/** 하루 시작 시각(기본 새벽 4시)을 기준으로 한 오늘의 일 번호 */
export function dayNumber(now: number, dayStartHour: number): number {
  const d = new Date(now - dayStartHour * 3600000);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
}

/** 다음 하루 시작 시각(ms) */
export function nextDayStart(now: number, dayStartHour: number): number {
  const d = new Date(now);
  d.setHours(dayStartHour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function fuzz(ivl: number, seed: string): number {
  if (ivl < 2.5) return Math.round(ivl);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const r = ((h >>> 0) % 1000) / 1000;
  const range = ivl < 7 ? 1 : ivl < 30 ? Math.max(2, Math.round(ivl * 0.15)) : Math.max(4, Math.round(ivl * 0.05));
  return Math.round(ivl - range + r * (2 * range + 1) - 0.5);
}

function clampIvl(ivl: number, cfg: DeckConfig, min = 1): number {
  return Math.max(min, Math.min(cfg.maxInterval, Math.round(ivl)));
}

export type Outcome = { kind: "learn"; dueMs: number; step: number } | { kind: "review"; ivl: number };

/** 답(ease)에 따른 다음 상태 계산 (카드를 바꾸지 않음) */
export function preview(card: Card, ease: Ease, cfg: DeckConfig, today: number, now: number): { outcome: Outcome; newEase: number; lapse: boolean } {
  const steps = card.state === "relearning" ? cfg.relearningSteps : cfg.learningSteps;
  if (card.state === "new" || card.state === "learning" || card.state === "relearning") {
    const relearn = card.state === "relearning";
    const step = card.state === "new" ? 0 : card.step;
    const graduate = (ivl: number): Outcome => ({ kind: "review", ivl });
    const relearnIvl = () => clampIvl(Math.max(cfg.minInterval, card.interval), cfg);
    if (ease === 1) {
      if (!steps.length) return { outcome: relearn ? graduate(relearnIvl()) : graduate(cfg.graduatingInterval), newEase: card.ease, lapse: false };
      return { outcome: { kind: "learn", dueMs: now + steps[0] * MIN, step: 0 }, newEase: card.ease, lapse: false };
    }
    if (ease === 2) {
      if (!steps.length) return { outcome: relearn ? graduate(relearnIvl()) : graduate(cfg.graduatingInterval), newEase: card.ease, lapse: false };
      // 첫 단계면 (1단계+2단계)/2 또는 1단계×1.5, 이후는 현재 단계 반복
      let delay: number;
      if (step === 0) delay = steps.length > 1 ? (steps[0] + steps[1]) / 2 : Math.min(steps[0] * 1.5, steps[0] + 1440);
      else delay = steps[step];
      return { outcome: { kind: "learn", dueMs: now + delay * MIN, step }, newEase: card.ease, lapse: false };
    }
    if (ease === 3) {
      const next = step + 1;
      if (next < steps.length) return { outcome: { kind: "learn", dueMs: now + steps[next] * MIN, step: next }, newEase: card.ease, lapse: false };
      return { outcome: relearn ? graduate(relearnIvl()) : graduate(cfg.graduatingInterval), newEase: card.ease, lapse: false };
    }
    // Easy: 바로 졸업
    const ivl = relearn ? clampIvl(relearnIvl() + 1, cfg) : cfg.easyInterval;
    return { outcome: graduate(ivl), newEase: card.ease, lapse: false };
  }

  // 복습 카드
  const elapsedDays = Math.max(0, today - (card.due - card.interval));
  const daysLate = Math.max(0, today - card.due);
  const cur = card.interval;
  const mod = cfg.intervalModifier;
  if (ease === 1) {
    const newEase = Math.max(1.3, card.ease - 0.2);
    const lapsedIvl = clampIvl(cur * cfg.lapseNewInterval, cfg, cfg.minInterval);
    if (cfg.relearningSteps.length) {
      return { outcome: { kind: "learn", dueMs: now + cfg.relearningSteps[0] * MIN, step: 0 }, newEase, lapse: true };
    }
    return { outcome: { kind: "review", ivl: lapsedIvl }, newEase, lapse: true };
  }
  void elapsedDays;
  const hardIvl = clampIvl(Math.max(cur + 1, cur * cfg.hardInterval * mod), cfg);
  if (ease === 2) return { outcome: { kind: "review", ivl: fuzz(hardIvl, card.id + card.reps) }, newEase: Math.max(1.3, card.ease - 0.15), lapse: false };
  const goodIvl = clampIvl(Math.max(hardIvl + 1, (cur + daysLate / 2) * card.ease * mod), cfg);
  if (ease === 3) return { outcome: { kind: "review", ivl: clampIvl(fuzz(goodIvl, card.id + card.reps), cfg) }, newEase: card.ease, lapse: false };
  const easyIvl = clampIvl(Math.max(goodIvl + 1, (cur + daysLate) * card.ease * cfg.easyBonus * mod), cfg);
  return { outcome: { kind: "review", ivl: clampIvl(fuzz(easyIvl, card.id + card.reps + "e"), cfg) }, newEase: card.ease + 0.15, lapse: false };
}

/** 카드에 답을 적용하고 복습 기록을 만든다 (카드를 직접 수정) */
export function answer(card: Card, ease: Ease, cfg: DeckConfig, today: number, now: number, durationMs: number): ReviewLog {
  const before = card.state;
  const lastIvl = card.interval;
  const { outcome, newEase, lapse } = preview(card, ease, cfg, today, now);
  if (card.state === "new") card.ease = cfg.startingEase;
  else card.ease = newEase;
  if (lapse) {
    card.lapses += 1;
    card.interval = clampIvl(card.interval * cfg.lapseNewInterval, cfg, cfg.minInterval);
  }
  card.reps += 1;
  if (outcome.kind === "learn") {
    card.state = lapse || before === "relearning" ? "relearning" : "learning";
    card.queue = "learning";
    card.step = outcome.step;
    card.due = outcome.dueMs;
  } else {
    card.state = "review";
    card.queue = "review";
    card.step = 0;
    card.interval = outcome.ivl;
    card.due = today + outcome.ivl;
  }
  return {
    id: uid(),
    cardId: card.id,
    time: now,
    ease,
    interval: outcome.kind === "learn" ? -Math.round((outcome.dueMs - now) / 1000) : outcome.ivl,
    lastInterval: lastIvl,
    factor: card.ease,
    durationMs,
    type: before,
  };
}

export function formatIvl(outcome: Outcome, now: number, lang: "en" | "ko"): string {
  let secs: number;
  if (outcome.kind === "learn") secs = Math.max(0, (outcome.dueMs - now) / 1000);
  else secs = outcome.ivl * 86400;
  return formatSecs(secs, lang);
}

export function formatSecs(secs: number, lang: "en" | "ko"): string {
  const ko = lang === "ko";
  if (secs < 60) return ko ? `${Math.max(1, Math.round(secs))}초` : `${Math.max(1, Math.round(secs))}s`;
  if (secs < 3600) return ko ? `${Math.round(secs / 60)}분` : `${Math.round(secs / 60)}m`;
  if (secs < 86400) return ko ? `${+(secs / 3600).toFixed(1)}시간` : `${+(secs / 3600).toFixed(1)}h`;
  const d = secs / 86400;
  if (d < 30) return ko ? `${Math.round(d)}일` : `${Math.round(d)}d`;
  if (d < 365) return ko ? `${+(d / 30).toFixed(1)}개월` : `${+(d / 30).toFixed(1)}mo`;
  return ko ? `${+(d / 365).toFixed(1)}년` : `${+(d / 365).toFixed(1)}y`;
}

/** 덱 이름 기준으로 하위 덱까지 포함한 id 목록 */
export function deckFamily(col: Collection, deckId: string): Set<string> {
  const deck = col.decks.find((d) => d.id === deckId);
  const out = new Set<string>([deckId]);
  if (!deck) return out;
  for (const d of col.decks) if (d.name.startsWith(deck.name + "::")) out.add(d.id);
  return out;
}

function unbury(card: Card, today: number) {
  if (card.queue === "buried" && (card.buriedUntil ?? 0) <= today) {
    card.queue = card.state === "new" ? "new" : card.state === "review" ? "review" : "learning";
    card.buriedUntil = undefined;
  }
}

export interface DeckCounts {
  newCount: number;
  learnCount: number;
  reviewCount: number;
}

function studiedToday(col: Collection, cardIds: Set<string>, now: number) {
  const start = nextDayStart(now, col.settings.dayStartHour) - DAY;
  let newDone = 0;
  let revDone = 0;
  for (const r of col.revlog) {
    if (r.time < start || !cardIds.has(r.cardId)) continue;
    if (r.type === "new") newDone++;
    else if (r.type === "review") revDone++;
  }
  return { newDone, revDone };
}

export function deckCounts(col: Collection, deckId: string, now: number): DeckCounts {
  const fam = deckFamily(col, deckId);
  const deck = col.decks.find((d) => d.id === deckId);
  const cfg = deck?.config;
  const today = dayNumber(now, col.settings.dayStartHour);
  const cutoff = nextDayStart(now, col.settings.dayStartHour);
  const ids = new Set<string>();
  let n = 0, l = 0, r = 0;
  for (const c of col.cards) {
    if (!fam.has(c.deckId)) continue;
    ids.add(c.id);
    unbury(c, today);
    if (c.queue === "new") n++;
    else if (c.queue === "learning" && c.due < cutoff) l++;
    else if (c.queue === "review" && c.due <= today) r++;
  }
  if (!cfg) return { newCount: n, learnCount: l, reviewCount: r };
  const { newDone, revDone } = studiedToday(col, ids, now);
  const extra = deck.extra && deck.extra.day === today ? deck.extra : { newCards: 0, reviews: 0 };
  return {
    newCount: Math.max(0, Math.min(n, cfg.newPerDay + extra.newCards - newDone)),
    learnCount: l,
    reviewCount: Math.max(0, Math.min(r, cfg.reviewsPerDay + extra.reviews - revDone)),
  };
}

/** 다음에 공부할 카드. 학습 중(시간 된 것) → 복습 → 새 카드 순, 학습 중 카드는 바로 다음 것이 없으면 미리 당겨서 보여줌 */
export function nextCard(col: Collection, deckId: string, now: number, skip: Set<string> = new Set()): Card | null {
  const fam = deckFamily(col, deckId);
  const today = dayNumber(now, col.settings.dayStartHour);
  const counts = deckCounts(col, deckId, now);
  const pool = col.cards.filter((c) => fam.has(c.deckId) && !skip.has(c.id));
  const learnNow = pool.filter((c) => c.queue === "learning" && c.due <= now).sort((a, b) => a.due - b.due);
  if (learnNow.length) return learnNow[0];
  if (counts.reviewCount > 0) {
    const rev = pool.filter((c) => c.queue === "review" && c.due <= today);
    if (rev.length) {
      rev.sort((a, b) => a.due - b.due || hash(a.id + today) - hash(b.id + today));
      return rev[0];
    }
  }
  if (counts.newCount > 0) {
    const nw = pool.filter((c) => c.queue === "new");
    if (nw.length) {
      const deck = col.decks.find((d) => d.id === deckId);
      if (deck?.config.newOrder === "random") nw.sort((a, b) => hash(a.id + today) - hash(b.id + today));
      else nw.sort((a, b) => a.due - b.due || a.ord - b.ord);
      return nw[0];
    }
  }
  // 오늘 안에 다시 볼 학습 카드는 앙키처럼 미리 당겨서(learn ahead 20분) 보여줌
  const ahead = pool.filter((c) => c.queue === "learning" && c.due <= now + 20 * MIN).sort((a, b) => a.due - b.due);
  return ahead[0] ?? null;
}

/** 오늘 남은 학습 카드 중 가장 빠른 시각 (기다리는 중 화면용) */
export function nextLearningDue(col: Collection, deckId: string, now: number): number | null {
  const fam = deckFamily(col, deckId);
  const cutoff = nextDayStart(now, col.settings.dayStartHour);
  let best: number | null = null;
  for (const c of col.cards) if (fam.has(c.deckId) && c.queue === "learning" && c.due < cutoff && (best === null || c.due < best)) best = c.due;
  return best;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return h;
}

/** 오늘만 한도 늘리기 */
export function addExtra(col: Collection, deckId: string, now: number, newCards: number, reviews: number) {
  const deck = col.decks.find((d) => d.id === deckId);
  if (!deck) return;
  const today = dayNumber(now, col.settings.dayStartHour);
  const cur = deck.extra && deck.extra.day === today ? deck.extra : { day: today, newCards: 0, reviews: 0 };
  deck.extra = { day: today, newCards: cur.newCards + newCards, reviews: cur.reviews + reviews };
}

export function deckOf(col: Collection, card: Card): Deck {
  return col.decks.find((d) => d.id === card.deckId) ?? col.decks[0];
}
