"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Collection } from "@/lib/cards/types";
import { loadCollection, saveCollection } from "@/lib/cards/collection";
import { cardStrings, type CardDict } from "@/lib/cards/strings";
import { useLang, type Lang } from "@/lib/i18n";
import { firebaseEnabled, getFirebase, signInWithGoogle, signOutFirebase, watchUser } from "@/lib/cards/firebase";
import { Syncer, type SyncStatus } from "@/lib/cards/sync";

export interface Account {
  enabled: boolean; // Firebase 설정이 들어 있는지
  ready: boolean; // 로그인 상태를 확인했는지
  email: string | null;
  status: SyncStatus;
  pending: number;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => void;
}

interface Ctx {
  col: Collection;
  /** 컬렉션을 바꾸고 저장 (fn 안에서 직접 수정) */
  mutate: (fn: (col: Collection) => void) => void;
  replace: (col: Collection) => void;
  version: number;
  t: CardDict;
  lang: Lang;
  toast: (msg: string) => void;
  account: Account;
}

const CardsCtx = createContext<Ctx | null>(null);

export function useCards(): Ctx {
  const c = useContext(CardsCtx);
  if (!c) throw new Error("CardsProvider missing");
  return c;
}

export function CardsProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const t = cardStrings(lang);
  const colRef = useRef<Collection | null>(null);
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncer = useRef<Syncer | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(!firebaseEnabled);
  const [status, setStatus] = useState<SyncStatus>("off");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    loadCollection().then((c) => {
      colRef.current = c;
      setVersion(1);
    });
    // 사파리가 저장 공간을 마음대로 비우지 않도록 요청
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const saveSoon = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => colRef.current && saveCollection(colRef.current), 300);
  }, []);

  const pushSoon = useCallback((ms = 1500) => {
    if (!syncer.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => syncer.current?.push(), ms);
  }, []);

  // 로그인 상태가 바뀌면 동기화 시작/중지
  useEffect(() => {
    if (!firebaseEnabled || version === 0) return;
    let off: (() => void) | undefined;
    let alive = true;
    watchUser(async (user) => {
      syncer.current?.stop();
      syncer.current = null;
      setEmail(user?.email ?? null);
      setReady(true);
      if (!user) { setStatus("off"); return; }
      const { db } = await getFirebase();
      if (!alive) return;
      const s = new Syncer(
        db,
        user.uid,
        () => colRef.current!,
        () => { setVersion((v) => v + 1); saveSoon(); },
        (st, n) => { setStatus(st); setPending(n); },
      );
      syncer.current = s;
      await s.start();
    }).then((u) => { off = u; }).catch((e) => { console.warn(e); setReady(true); setStatus("error"); });
    return () => { alive = false; off?.(); syncer.current?.stop(); syncer.current = null; };
  }, [version === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // 앱을 닫거나 백그라운드로 갈 때 바로 저장·업로드
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== "hidden" || !colRef.current) return;
      saveCollection(colRef.current);
      syncer.current?.push();
    };
    const online = () => syncer.current?.push();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("online", online);
    };
  }, []);

  const mutate = useCallback((fn: (col: Collection) => void) => {
    if (!colRef.current) return;
    fn(colRef.current);
    setVersion((v) => v + 1);
    saveSoon();
    pushSoon();
  }, [saveSoon, pushSoon]);

  const replace = useCallback((col: Collection) => {
    colRef.current = col;
    setVersion((v) => v + 1);
    saveSoon();
    pushSoon(100);
  }, [saveSoon, pushSoon]);

  const toast = useCallback((m: string) => setMsg(m), []);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(id);
  }, [msg]);

  const account: Account = {
    enabled: firebaseEnabled,
    ready,
    email,
    status,
    pending,
    signIn: async () => {
      try {
        await signInWithGoogle();
      } catch (e) {
        console.warn(e);
        toast(t.signInFail);
      }
    },
    signOut: async () => {
      await syncer.current?.push();
      await signOutFirebase();
    },
    syncNow: () => syncer.current?.push(),
  };

  if (!colRef.current) return <div className="fc fc-loading" />;
  return (
    <CardsCtx.Provider value={{ col: colRef.current, mutate, replace, version, t, lang, toast, account }}>
      {children}
      {msg && <div className="fc-toast" role="status">{msg}</div>}
    </CardsCtx.Provider>
  );
}
