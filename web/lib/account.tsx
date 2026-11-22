"use client";

// 앱 전체 로그인 상태 (첫 화면에서 로그인 → Math·Spanish 모두 동기화)
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { firebaseEnabled, getFirebase, signInWithGoogle, signOutFirebase, watchUser } from "./cards/firebase";
import { KvSyncer } from "./kvSync";

export interface AccountUser { uid: string; email: string | null; name: string | null; photo: string | null }

export interface AccountCtx {
  enabled: boolean;
  ready: boolean;
  user: AccountUser | null;
  db: Firestore | null;
  /** Math 데이터 동기화 상태 */
  mathBusy: boolean;
  mathError: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /** 로그아웃 전에 올릴 것 올리기 (카드 쪽에서 등록) */
  beforeSignOut: React.MutableRefObject<(() => Promise<void>) | null>;
}

const Ctx = createContext<AccountCtx | null>(null);

export function useAccount(): AccountCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("AccountProvider missing");
  return c;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!firebaseEnabled);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [db, setDb] = useState<Firestore | null>(null);
  const [mathBusy, setMathBusy] = useState(false);
  const [mathError, setMathError] = useState(false);
  const kv = useRef<KvSyncer | null>(null);
  const beforeSignOut = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    // 사파리가 저장 공간(로그인 정보·기록)을 마음대로 비우지 않도록 요청
    navigator.storage?.persist?.().catch(() => {});
    if (!firebaseEnabled) return;
    let off: (() => void) | undefined;
    let alive = true;
    watchUser(async (u) => {
      kv.current?.stop();
      kv.current = null;
      if (!u) {
        setUser(null);
        setReady(true);
        return;
      }
      const fb = await getFirebase();
      if (!alive) return;
      setDb(fb.db);
      setUser({ uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL });
      setReady(true);
      const s = new KvSyncer(fb.db, u.uid, (busy, err) => { setMathBusy(busy); setMathError(err); });
      kv.current = s;
      await s.start();
    })
      .then((u) => { off = u; })
      .catch((e) => { console.warn(e); setReady(true); });
    // 백그라운드로 갈 때 바로 올리기
    const flush = () => { if (document.visibilityState === "hidden") void kv.current?.push(); };
    document.addEventListener("visibilitychange", flush);
    return () => {
      alive = false;
      off?.();
      kv.current?.stop();
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  const value: AccountCtx = {
    enabled: firebaseEnabled,
    ready,
    user,
    db,
    mathBusy,
    mathError,
    beforeSignOut,
    signIn: async () => {
      try {
        await signInWithGoogle();
        return true;
      } catch (e) {
        console.warn(e);
        return false;
      }
    },
    signOut: async () => {
      await kv.current?.push();
      await beforeSignOut.current?.();
      await signOutFirebase();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
