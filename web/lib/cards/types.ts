// 앙키식 플래시카드 데이터 구조. 모두 브라우저(IndexedDB)에 저장한다.

export type NoteType = "basic" | "reversed" | "cloze";
export type CardState = "new" | "learning" | "review" | "relearning";
export type Queue = "new" | "learning" | "review" | "suspended" | "buried";
export type Ease = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface DeckConfig {
  newPerDay: number;
  reviewsPerDay: number;
  learningSteps: number[]; // 분
  relearningSteps: number[]; // 분
  graduatingInterval: number; // 일
  easyInterval: number; // 일
  startingEase: number; // 2.5 = 250%
  easyBonus: number; // 1.3
  hardInterval: number; // 1.2
  intervalModifier: number; // 1.0
  maxInterval: number; // 일
  lapseNewInterval: number; // 0 = 잊으면 간격 0%
  minInterval: number; // 1일
  leechThreshold: number; // 이만큼 잊으면 거머리 태그 + 보류
  newOrder: "added" | "random";
  buryNewSiblings: boolean; // 같은 노트의 다른 카드는 내일로
}

export interface Deck {
  id: string;
  name: string; // "수학::미적분" 처럼 :: 로 하위 덱
  created: number;
  config: DeckConfig;
  description?: string;
  extra?: { day: number; newCards: number; reviews: number }; // 오늘만 늘린 한도 (더 공부하기)
}

export interface Note {
  id: string;
  type: NoteType;
  fields: { front: string; back: string; extra?: string }; // cloze: front = 본문(cloze 포함), extra = 뒷면 추가 설명
  tags: string[];
  deckId: string;
  created: number;
  modified: number;
}

export interface Card {
  id: string;
  noteId: string;
  deckId: string;
  ord: number; // basic 0, reversed 0/1, cloze 번호-1
  state: CardState;
  queue: Queue;
  due: number; // learning: ms 타임스탬프, review: 일 번호(dayNumber), new: 순서 번호
  interval: number; // 일
  ease: number; // 2.5 = 250%
  reps: number;
  lapses: number;
  step: number; // 현재 학습 단계 인덱스
  flag: number; // 0 없음, 1 빨강, 2 주황, 3 초록, 4 파랑
  buriedUntil?: number; // dayNumber
  created: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  time: number; // ms
  ease: Ease;
  interval: number; // 새 간격(일, 학습 중이면 음수 = 초)
  lastInterval: number;
  factor: number;
  durationMs: number;
  type: CardState; // 답하기 전 상태
}

export interface Collection {
  version: 1;
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  revlog: ReviewLog[];
  settings: { dayStartHour: number; showIntervals: boolean; showRemaining: boolean; lastDeckId?: string };
  nextNewPos: number;
  media?: Record<string, string>; // 이미지 id → data URL (필드에는 ![](media:id))
}

export const DEFAULT_CONFIG: DeckConfig = {
  newPerDay: 20,
  reviewsPerDay: 200,
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  hardInterval: 1.2,
  intervalModifier: 1,
  maxInterval: 36500,
  lapseNewInterval: 0,
  minInterval: 1,
  leechThreshold: 8,
  newOrder: "added",
  buryNewSiblings: true,
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
