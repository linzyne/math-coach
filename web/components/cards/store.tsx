"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Collection } from "@/lib/cards/types";
import { loadCollection, saveCollection } from "@/lib/cards/collection";
import { cardStrings, type CardDict } from "@/lib/cards/strings";
import { useLang, type Lang } from "@/lib/i18n";
import { Syncer, type SyncStatus } from "@/lib/cards/sync";
import { useAccount } from "@/lib/account";

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
  const acct = useAccount();
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

  // 로그인돼 있으면 카드 동기화 시작 (로그인은 첫 화면에서)
  const loaded = version > 0;
  useEffect(() => {
    if (!loaded || !acct.user || !acct.db) { setStatus("off"); return; }
    const s = new Syncer(
      acct.db,
      acct.user.uid,
      () => colRef.current!,
      () => { setVersion((v) => v + 1); saveSoon(); },
      (st, n) => { setStatus(st); setPending(n); },
    );
    syncer.current = s;
    acct.beforeSignOut.current = () => s.push();
    void s.start();
    return () => { s.stop(); if (syncer.current === s) syncer.current = null; acct.beforeSignOut.current = null; };
  }, [loaded, acct.user?.uid, acct.db]); // eslint-disable-line react-hooks/exhaustive-deps

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
    enabled: acct.enabled,
    ready: acct.ready,
    email: acct.user ? acct.user.email ?? acct.user.name ?? "" : null,
    status,
    pending,
    signIn: async () => {
      if (!(await acct.signIn())) toast(t.signInFail);
    },
    signOut: acct.signOut,
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
