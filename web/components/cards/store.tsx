"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Collection } from "@/lib/cards/types";
import { loadCollection, saveCollection } from "@/lib/cards/collection";
import { cardStrings, type CardDict } from "@/lib/cards/strings";
import { useLang, type Lang } from "@/lib/i18n";

interface Ctx {
  col: Collection;
  /** 컬렉션을 바꾸고 저장 (fn 안에서 직접 수정) */
  mutate: (fn: (col: Collection) => void) => void;
  replace: (col: Collection) => void;
  version: number;
  t: CardDict;
  lang: Lang;
  toast: (msg: string) => void;
}

const CardsCtx = createContext<Ctx | null>(null);

export function useCards(): Ctx {
  const c = useContext(CardsCtx);
  if (!c) throw new Error("CardsProvider missing");
  return c;
}

export function CardsProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const colRef = useRef<Collection | null>(null);
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCollection().then((c) => {
      colRef.current = c;
      setVersion(1);
    });
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => colRef.current && saveCollection(colRef.current), 300);
  }, []);

  // 앱을 닫거나 백그라운드로 갈 때 바로 저장
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && colRef.current) saveCollection(colRef.current);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  const mutate = useCallback((fn: (col: Collection) => void) => {
    if (!colRef.current) return;
    fn(colRef.current);
    setVersion((v) => v + 1);
    scheduleSave();
  }, [scheduleSave]);

  const replace = useCallback((col: Collection) => {
    colRef.current = col;
    setVersion((v) => v + 1);
    scheduleSave();
  }, [scheduleSave]);

  const toast = useCallback((m: string) => setMsg(m), []);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(id);
  }, [msg]);

  if (!colRef.current) return <div className="fc fc-loading" />;
  return (
    <CardsCtx.Provider value={{ col: colRef.current, mutate, replace, version, t: cardStrings(lang), lang, toast }}>
      {children}
      {msg && <div className="fc-toast" role="status">{msg}</div>}
    </CardsCtx.Provider>
  );
}
