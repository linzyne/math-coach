// Firestore 동기화.
// - 기기 안(IndexedDB)이 원본이고, 바뀐 문서만 users/{uid}/{종류}/{id} 로 올린다.
// - 다른 기기에서 바뀐 문서는 실시간으로 받아 와서 합친다 (문서마다 마지막에 고친 쪽이 이김).
// - 지운 문서는 _d: true 로 남겨서 다른 기기도 지우게 한다.
import type { Firestore, Unsubscribe } from "firebase/firestore";
import type { Collection } from "./types";
import { kvGet, kvSet } from "./collection";

const KINDS = ["decks", "notes", "cards", "revlog", "media", "meta"] as const;
type Kind = (typeof KINDS)[number];

interface DocMeta { u: number; h: string; d?: boolean }
interface SyncState { meta: Record<string, DocMeta>; lastPull: Partial<Record<Kind, number>> }

export type SyncStatus = "off" | "syncing" | "synced" | "offline" | "error";

function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (h2 * 31 + c) | 0;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}

/** 컬렉션을 "종류/id" → 문서 로 펼친다 */
function localDocs(col: Collection): Map<string, { kind: Kind; id: string; data: object; h: string }> {
  const out = new Map<string, { kind: Kind; id: string; data: object; h: string }>();
  const add = (kind: Kind, id: string, data: object, h?: string) => out.set(`${kind}/${id}`, { kind, id, data, h: h ?? hash(JSON.stringify(data)) });
  for (const d of col.decks) add("decks", d.id, d);
  for (const n of col.notes) add("notes", n.id, n);
  for (const c of col.cards) add("cards", c.id, c);
  for (const r of col.revlog) add("revlog", r.id, r, "r"); // 복습 기록은 바뀌지 않음
  for (const [id, data] of Object.entries(col.media ?? {})) add("media", id, { data }, "m"); // 사진도 바뀌지 않음
  add("meta", "settings", { settings: col.settings, nextNewPos: col.nextNewPos });
  return out;
}

function strip(data: Record<string, unknown>): Record<string, unknown> {
  const { _u, _d, _s, ...rest } = data;
  void _u; void _d; void _s;
  return rest;
}

/** 원격 문서 하나를 컬렉션에 반영 */
function applyRemote(col: Collection, kind: Kind, id: string, data: Record<string, unknown> | null) {
  if (kind === "meta") {
    if (data && id === "settings") {
      col.settings = { ...col.settings, ...(data.settings as object) };
      col.nextNewPos = Math.max(col.nextNewPos, Number(data.nextNewPos) || 0);
    }
    return;
  }
  if (kind === "media") {
    col.media ??= {};
    if (data) col.media[id] = String(data.data ?? "");
    else delete col.media[id];
    return;
  }
  const arr = col[kind] as unknown as { id: string }[];
  const i = arr.findIndex((x) => x.id === id);
  if (!data) {
    if (i >= 0) arr.splice(i, 1);
  } else if (i >= 0) arr[i] = data as unknown as { id: string };
  else arr.push(data as unknown as { id: string });
}

/** 기기마다 따로 만든 같은 이름의 덱(예: Default)을 하나로 합친다 */
function mergeSameNameDecks(col: Collection) {
  const byName = new Map<string, string>();
  for (const d of [...col.decks].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))) {
    const keep = byName.get(d.name);
    if (!keep) { byName.set(d.name, d.id); continue; }
    for (const c of col.cards) if (c.deckId === d.id) c.deckId = keep;
    for (const n of col.notes) if (n.deckId === d.id) n.deckId = keep;
    if (col.settings.lastDeckId === d.id) col.settings.lastDeckId = keep;
    col.decks = col.decks.filter((x) => x.id !== d.id);
  }
}

export class Syncer {
  private state: SyncState = { meta: {}, lastPull: {} };
  private unsubs: Unsubscribe[] = [];
  private pushing = false;
  private again = false;
  private stopped = false;
  private stateKey: string;

  constructor(
    private db: Firestore,
    private uid: string,
    private getCol: () => Collection,
    private onRemote: () => void,
    private onStatus: (s: SyncStatus, pending: number) => void,
  ) {
    this.stateKey = `sync:${uid}`;
  }

  async start() {
    this.state = (await kvGet<SyncState>(this.stateKey)) ?? { meta: {}, lastPull: {} };
    const { collection, query, where, onSnapshot, Timestamp } = await import("firebase/firestore");
    this.onStatus("syncing", 0);
    let firstPending = KINDS.length;
    for (const kind of KINDS) {
      const since = this.state.lastPull[kind] ?? 0;
      const q = query(collection(this.db, "users", this.uid, kind), where("_s", ">=", Timestamp.fromMillis(since)));
      const unsub = onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
        let changed = false;
        let maxS = this.state.lastPull[kind] ?? 0;
        const col = this.getCol();
        for (const ch of snap.docChanges()) {
          if (ch.type === "removed" || ch.doc.metadata.hasPendingWrites) continue;
          const raw = ch.doc.data() as Record<string, unknown> & { _u?: number; _d?: boolean; _s?: { toMillis(): number } };
          const s = raw._s?.toMillis?.() ?? 0;
          if (s > maxS) maxS = s;
          const key = `${kind}/${ch.doc.id}`;
          const u = Number(raw._u) || 0;
          const m = this.state.meta[key];
          if (m && m.u >= u) continue; // 내가 올린 것이거나 더 오래된 것
          const data = raw._d ? null : strip(raw);
          applyRemote(col, kind, ch.doc.id, data);
          const h = kind === "revlog" ? "r" : kind === "media" ? "m" : data ? hash(JSON.stringify(kind === "meta" ? { settings: col.settings, nextNewPos: col.nextNewPos } : data)) : "";
          this.state.meta[key] = { u, h, d: raw._d || undefined };
          changed = true;
        }
        this.state.lastPull[kind] = maxS;
        if (changed) {
          if (kind === "decks") mergeSameNameDecks(this.getCol());
          this.onRemote();
          void kvSet(this.stateKey, this.state);
        }
        if (firstPending > 0 && !snap.metadata.fromCache) {
          firstPending--;
          // 처음 받아오기가 끝나면 이 기기에만 있던 카드를 올린다
          if (firstPending === 0) void this.push();
        }
      }, (err) => {
        console.warn("sync listen error", err);
        this.onStatus(navigator.onLine ? "error" : "offline", this.pendingCount());
      });
      this.unsubs.push(unsub);
    }
  }

  stop() {
    this.stopped = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  pendingCount(): number {
    const docs = localDocs(this.getCol());
    let n = 0;
    for (const [k, v] of docs) if (this.state.meta[k]?.h !== v.h || this.state.meta[k]?.d) n++;
    for (const [k, m] of Object.entries(this.state.meta)) if (!m.d && !docs.has(k)) n++;
    return n;
  }

  /** 바뀐 문서만 올리기 */
  async push(): Promise<void> {
    if (this.stopped) return;
    if (this.pushing) { this.again = true; return; }
    this.pushing = true;
    try {
      const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
      const docs = localDocs(this.getCol());
      type Op = { key: string; kind: Kind; id: string; data: Record<string, unknown>; meta: DocMeta; size: number };
      const ops: Op[] = [];
      const now = Date.now();
      let tick = 0;
      for (const [key, v] of docs) {
        const m = this.state.meta[key];
        if (m && !m.d && m.h === v.h) continue;
        const u = Math.max(now + tick++ * 0, (m?.u ?? 0) + 1);
        const size = v.kind === "media" ? String((v.data as { data: string }).data).length : 1000;
        ops.push({ key, kind: v.kind, id: v.id, data: { ...(v.data as Record<string, unknown>), _u: u, _d: false }, meta: { u, h: v.h }, size });
      }
      for (const [key, m] of Object.entries(this.state.meta)) {
        if (m.d || docs.has(key)) continue;
        const [kind, id] = key.split("/") as [Kind, string];
        if (kind === "meta") continue;
        const u = Math.max(now, m.u + 1);
        ops.push({ key, kind, id, data: { _u: u, _d: true }, meta: { u, h: "", d: true }, size: 100 });
      }
      if (!ops.length) { this.onStatus("synced", 0); return; }
      this.onStatus("syncing", ops.length);
      // 한 번에 최대 400개, 약 8MB까지
      let i = 0;
      while (i < ops.length && !this.stopped) {
        const batch = writeBatch(this.db);
        const chunk: Op[] = [];
        let bytes = 0;
        while (i < ops.length && chunk.length < 400 && (chunk.length === 0 || bytes + ops[i].size < 8_000_000)) {
          const op = ops[i++];
          bytes += op.size;
          chunk.push(op);
          batch.set(doc(this.db, "users", this.uid, op.kind, op.id), { ...op.data, _s: serverTimestamp() });
        }
        await batch.commit();
        for (const op of chunk) this.state.meta[op.key] = op.meta;
        await kvSet(this.stateKey, this.state);
        this.onStatus("syncing", ops.length - i);
      }
      this.onStatus("synced", 0);
    } catch (e) {
      console.warn("sync push error", e);
      this.onStatus(navigator.onLine ? "error" : "offline", this.pendingCount());
    } finally {
      this.pushing = false;
      if (this.again) { this.again = false; void this.push(); }
    }
  }
}
