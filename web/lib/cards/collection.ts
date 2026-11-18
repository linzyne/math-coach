// 컬렉션 저장(IndexedDB)과 노트·카드 조작
import type { Card, Collection, Deck, Note, NoteType } from "./types";
import { DEFAULT_CONFIG, uid } from "./types";
import { dayNumber } from "./scheduler";

const DB = "flashcards";
const STORE = "kv";
const KEY = "collection";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export async function loadCollection(): Promise<Collection> {
  try {
    const db = await openDb();
    const col = await new Promise<Collection | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as Collection | undefined);
      req.onerror = () => reject(req.error);
    });
    if (col) return migrate(col);
  } catch {
    // IndexedDB를 못 쓰면 localStorage로
    try {
      const raw = localStorage.getItem("flashcards");
      if (raw) return migrate(JSON.parse(raw));
    } catch {}
  }
  return emptyCollection();
}

export async function saveCollection(col: Collection): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(col, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem("flashcards", JSON.stringify(col));
    } catch {}
  }
}

function migrate(col: Collection): Collection {
  col.settings = Object.assign({ dayStartHour: 4, showIntervals: true, showRemaining: true }, col.settings);
  for (const d of col.decks) d.config = { ...DEFAULT_CONFIG, ...d.config };
  col.revlog ??= [];
  col.nextNewPos ??= col.cards.length;
  if (!col.decks.length) col.decks.push(newDeck("Default"));
  return col;
}

export function newDeck(name: string): Deck {
  return { id: uid(), name, created: Date.now(), config: { ...DEFAULT_CONFIG, learningSteps: [...DEFAULT_CONFIG.learningSteps], relearningSteps: [...DEFAULT_CONFIG.relearningSteps] } };
}

export function emptyCollection(): Collection {
  return { version: 1, decks: [newDeck("Default")], notes: [], cards: [], revlog: [], settings: { dayStartHour: 4, showIntervals: true, showRemaining: true }, nextNewPos: 0 };
}

/** cloze 본문에 있는 번호들 ({{c1::…}}, {{c2::…}}) */
export function clozeNumbers(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\{\{c(\d+)::/g)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

/** 노트에서 만들어져야 할 카드 ord 목록 */
export function cardOrds(type: NoteType, fields: Note["fields"]): number[] {
  if (type === "basic") return [0];
  if (type === "reversed") return fields.back.trim() ? [0, 1] : [0];
  return clozeNumbers(fields.front).map((n) => n - 1);
}

function makeCard(col: Collection, note: Note, ord: number): Card {
  return {
    id: uid(),
    noteId: note.id,
    deckId: note.deckId,
    ord,
    state: "new",
    queue: "new",
    due: col.nextNewPos,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    step: 0,
    flag: 0,
    created: Date.now(),
  };
}

export function addNote(col: Collection, type: NoteType, fields: Note["fields"], tags: string[], deckId: string): Note {
  const now = Date.now();
  const note: Note = { id: uid(), type, fields, tags, deckId, created: now, modified: now };
  col.notes.push(note);
  for (const ord of cardOrds(type, fields)) col.cards.push(makeCard(col, note, ord));
  col.nextNewPos++;
  return note;
}

/** 노트 수정. 필요한 카드는 새로 만들고, 사라진 cloze 카드는 지운다 */
export function updateNote(col: Collection, noteId: string, patch: Partial<Pick<Note, "fields" | "tags" | "type">>) {
  const note = col.notes.find((n) => n.id === noteId);
  if (!note) return;
  Object.assign(note, patch, { modified: Date.now() });
  const want = new Set(cardOrds(note.type, note.fields));
  const have = col.cards.filter((c) => c.noteId === noteId);
  const haveOrds = new Set(have.map((c) => c.ord));
  col.cards = col.cards.filter((c) => c.noteId !== noteId || want.has(c.ord));
  for (const ord of want) if (!haveOrds.has(ord)) col.cards.push(makeCard(col, note, ord));
}

export function deleteNotes(col: Collection, noteIds: Set<string>) {
  const cardIds = new Set(col.cards.filter((c) => noteIds.has(c.noteId)).map((c) => c.id));
  col.notes = col.notes.filter((n) => !noteIds.has(n.id));
  col.cards = col.cards.filter((c) => !cardIds.has(c.id));
  col.revlog = col.revlog.filter((r) => !cardIds.has(r.cardId));
}

export function deleteDeck(col: Collection, deckId: string) {
  const deck = col.decks.find((d) => d.id === deckId);
  if (!deck) return;
  const ids = new Set(col.decks.filter((d) => d.id === deckId || d.name.startsWith(deck.name + "::")).map((d) => d.id));
  deleteNotes(col, new Set(col.notes.filter((n) => ids.has(n.deckId)).map((n) => n.id)));
  col.cards = col.cards.filter((c) => !ids.has(c.deckId));
  col.decks = col.decks.filter((d) => !ids.has(d.id));
  if (!col.decks.length) col.decks.push(newDeck("Default"));
}

export function renameDeck(col: Collection, deckId: string, name: string) {
  const deck = col.decks.find((d) => d.id === deckId);
  if (!deck) return;
  const old = deck.name;
  for (const d of col.decks) if (d.name.startsWith(old + "::")) d.name = name + d.name.slice(old.length);
  deck.name = name;
}

export function moveCards(col: Collection, cardIds: Set<string>, deckId: string) {
  for (const c of col.cards) if (cardIds.has(c.id)) c.deckId = deckId;
  // 노트 기본 덱은 첫 카드 덱을 따름
  for (const n of col.notes) {
    const first = col.cards.find((c) => c.noteId === n.id);
    if (first) n.deckId = first.deckId;
  }
}

export function resetCards(col: Collection, cardIds: Set<string>) {
  for (const c of col.cards) {
    if (!cardIds.has(c.id)) continue;
    Object.assign(c, { state: "new", queue: "new", due: col.nextNewPos++, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, buriedUntil: undefined });
  }
}

export function setSuspended(col: Collection, cardIds: Set<string>, on: boolean) {
  for (const c of col.cards) {
    if (!cardIds.has(c.id)) continue;
    if (on) c.queue = "suspended";
    else if (c.queue === "suspended") c.queue = c.state === "new" ? "new" : c.state === "review" ? "review" : "learning";
  }
}

export function bury(col: Collection, cardIds: Set<string>, now: number) {
  const today = dayNumber(now, col.settings.dayStartHour);
  for (const c of col.cards) {
    if (!cardIds.has(c.id) || c.queue === "suspended") continue;
    c.queue = "buried";
    c.buriedUntil = today + 1;
  }
}

/** 새 카드나 복습 카드를 답한 뒤 같은 노트의 다른 카드는 내일로 */
export function burySiblings(col: Collection, card: Card, now: number) {
  const ids = new Set(col.cards.filter((c) => c.noteId === card.noteId && c.id !== card.id && (c.queue === "new" || c.queue === "review")).map((c) => c.id));
  if (ids.size) bury(col, ids, now);
}

export function allTags(col: Collection): string[] {
  const s = new Set<string>();
  for (const n of col.notes) for (const t of n.tags) s.add(t);
  return [...s].sort();
}

export function sortedDecks(col: Collection): Deck[] {
  return [...col.decks].sort((a, b) => a.name.localeCompare(b.name));
}

/** 하위 덱 이름이 있으면 부모 덱도 자동으로 만든다 */
export function ensureDeck(col: Collection, name: string): Deck {
  name = name.split("::").map((s) => s.trim()).filter(Boolean).join("::") || "Default";
  const parts = name.split("::");
  let deck: Deck | undefined;
  for (let i = 1; i <= parts.length; i++) {
    const n = parts.slice(0, i).join("::");
    deck = col.decks.find((d) => d.name === n);
    if (!deck) {
      deck = newDeck(n);
      col.decks.push(deck);
    }
  }
  return deck!;
}
