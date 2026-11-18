// Math 앱 데이터(localStorage) 동기화: 내 문제 목록, 필기, 입력한 식, 힌트 기록.
// users/{uid}/kv/{키} 문서에 값(JSON 문자열)을 그대로 저장. 키마다 마지막에 고친 쪽이 이김.
// 문제 목록은 두 기기에서 동시에 추가해도 잃지 않게 합친다.
import type { Firestore, Unsubscribe } from "firebase/firestore";
import { kvGet, kvSet } from "./cards/collection";

export const isSyncedKey = (k: string) => k === "customProblems" || /^(ink|typed|hints):/.test(k);
export const STORAGE_EVENT = "synced-storage";

interface Meta { u: number; h: string; d?: boolean }
interface State { meta: Record<string, Meta>; lastPull: number }

function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (h2 * 31 + c) | 0;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}

// localStorage.setItem/removeItem 을 가로채서 바뀐 키를 알아낸다 (앱 코드는 그대로)
type Raw = { set: (k: string, v: string) => void; remove: (k: string) => void };
let raw: Raw | null = null;
let onLocalChange: ((k: string) => void) | null = null;

function patchStorage(): Raw {
  if (raw) return raw;
  const proto = Storage.prototype as Storage & { __synced?: Raw };
  if (proto.__synced) return (raw = proto.__synced);
  const origSet = proto.setItem;
  const origRemove = proto.removeItem;
  proto.setItem = function (this: Storage, k: string, v: string) {
    origSet.call(this, k, v);
    if (this === window.localStorage && isSyncedKey(k)) onLocalChange?.(k);
  };
  proto.removeItem = function (this: Storage, k: string) {
    origRemove.call(this, k);
    if (this === window.localStorage && isSyncedKey(k)) onLocalChange?.(k);
  };
  raw = { set: (k, v) => origSet.call(localStorage, k, v), remove: (k) => origRemove.call(localStorage, k) };
  proto.__synced = raw;
  return raw;
}

const MAX_LEN = 900_000; // Firestore 문서 1MB 제한

export class KvSyncer {
  private state: State = { meta: {}, lastPull: 0 };
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsub: Unsubscribe | null = null;
  private pushing = false;
  private again = false;
  private stopped = false;
  private raw: Raw;
  private stateKey: string;

  constructor(private db: Firestore, private uid: string, private onStatus: (busy: boolean, error: boolean) => void) {
    this.raw = patchStorage();
    this.stateKey = `kvsync:${uid}`;
  }

  async start() {
    this.state = (await kvGet<State>(this.stateKey)) ?? { meta: {}, lastPull: 0 };
    onLocalChange = (k) => this.mark(k);
    const { collection, query, where, onSnapshot, Timestamp } = await import("firebase/firestore");
    let first = true;
    const q = query(collection(this.db, "users", this.uid, "kv"), where("_s", ">=", Timestamp.fromMillis(this.state.lastPull)));
    this.unsub = onSnapshot(q, (snap) => {
      const changed: string[] = [];
      for (const ch of snap.docChanges()) {
        if (ch.type === "removed" || ch.doc.metadata.hasPendingWrites) continue;
        const d = ch.doc.data() as { v?: string; _u?: number; _d?: boolean; _s?: { toMillis(): number } };
        const s = d._s?.toMillis?.() ?? 0;
        if (s > this.state.lastPull) this.state.lastPull = s;
        const key = decodeURIComponent(ch.doc.id);
        if (!isSyncedKey(key)) continue;
        const u = Number(d._u) || 0;
        const m = this.state.meta[key];
        if (m && m.u >= u) continue;
        if (d._d) {
          this.raw.remove(key);
          this.state.meta[key] = { u, h: "", d: true };
        } else {
          let v = String(d.v ?? "");
          const local = localStorage.getItem(key);
          // 이 기기에서 아직 안 올린 문제가 있으면 합친다
          if (key === "customProblems" && local && hash(local) !== m?.h) {
            v = mergeProblems(v, local);
            this.dirty.add(key);
          }
          this.raw.set(key, v);
          this.state.meta[key] = { u, h: key === "customProblems" && this.dirty.has(key) ? "" : hash(v) };
        }
        changed.push(key);
      }
      if (changed.length) {
        window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: changed }));
        void kvSet(this.stateKey, this.state);
      }
      if (first && !snap.metadata.fromCache) {
        first = false;
        this.scanAll();
      }
    }, () => this.onStatus(false, true));
  }

  stop() {
    this.stopped = true;
    this.unsub?.();
    if (onLocalChange) onLocalChange = null;
    if (this.timer) clearTimeout(this.timer);
  }

  /** 처음 로그인했을 때: 이 기기에만 있는 것·바뀐 것을 모두 올린다 */
  private scanAll() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !isSyncedKey(k)) continue;
      const v = localStorage.getItem(k) ?? "";
      if (this.state.meta[k]?.h !== hash(v)) this.dirty.add(k);
    }
    for (const [k, m] of Object.entries(this.state.meta)) if (!m.d && localStorage.getItem(k) === null) this.dirty.add(k);
    this.schedule(200);
  }

  private mark(k: string) {
    this.dirty.add(k);
    this.schedule(2500);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push(), ms);
  }

  async push(): Promise<void> {
    if (this.stopped || !this.dirty.size) return;
    if (this.pushing) { this.again = true; return; }
    this.pushing = true;
    this.onStatus(true, false);
    try {
      const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
      const keys = [...this.dirty];
      this.dirty.clear();
      const now = Date.now();
      const ops: { key: string; data: Record<string, unknown>; meta: Meta; size: number }[] = [];
      for (const key of keys) {
        const v = localStorage.getItem(key);
        const m = this.state.meta[key];
        const u = Math.max(now, (m?.u ?? 0) + 1);
        if (v === null) {
          if (m && !m.d) ops.push({ key, data: { _u: u, _d: true }, meta: { u, h: "", d: true }, size: 100 });
          continue;
        }
        const h = hash(v);
        if (m && !m.d && m.h === h) continue;
        if (v.length > MAX_LEN) continue; // 너무 큰 필기는 이 기기에만
        ops.push({ key, data: { v, _u: u, _d: false }, meta: { u, h }, size: v.length });
      }
      let i = 0;
      while (i < ops.length && !this.stopped) {
        const batch = writeBatch(this.db);
        const chunk: typeof ops = [];
        let bytes = 0;
        while (i < ops.length && chunk.length < 400 && (chunk.length === 0 || bytes + ops[i].size < 8_000_000)) {
          const op = ops[i++];
          bytes += op.size;
          chunk.push(op);
          batch.set(doc(this.db, "users", this.uid, "kv", encodeURIComponent(op.key)), { ...op.data, _s: serverTimestamp() });
        }
        try {
          await batch.commit();
          for (const op of chunk) this.state.meta[op.key] = op.meta;
        } catch (e) {
          for (const op of chunk) this.dirty.add(op.key);
          throw e;
        }
      }
      await kvSet(this.stateKey, this.state);
      this.onStatus(false, false);
    } catch (e) {
      console.warn("kv sync error", e);
      this.onStatus(false, true);
      this.schedule(15000);
    } finally {
      this.pushing = false;
      if (this.again) { this.again = false; void this.push(); }
    }
  }
}

function mergeProblems(remote: string, local: string): string {
  try {
    const r = JSON.parse(remote) as { id: string }[];
    const l = JSON.parse(local) as { id: string }[];
    const ids = new Set(r.map((p) => p.id));
    return JSON.stringify([...r, ...l.filter((p) => !ids.has(p.id))]);
  } catch {
    return remote;
  }
}
