"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

// math.js는 계산기를 처음 열 때만 불러옴 (첫 화면을 가볍게)
type MathLike = { evaluate: (e: string) => unknown; format: (v: unknown, o?: object) => string; fraction: (v: number) => { n: number | bigint; d: number | bigint; s: number | bigint } };
let mathPromise: Promise<MathLike> | null = null;
function loadMath(): Promise<MathLike> {
  mathPromise ??= import("mathjs").then((m) => {
    const math = m.create(m.all);
    const deg = (f: (x: number) => number) => (x: number) => f((x * Math.PI) / 180);
    const adeg = (f: (x: number) => number) => (x: number) => (f(x) * 180) / Math.PI;
    math.import(
      {
        nCr: (n: number, r: number) => math.combinations(n, r),
        nPr: (n: number, r: number) => math.permutations(n, r),
        sinD: deg(Math.sin), cosD: deg(Math.cos), tanD: deg(Math.tan),
        asinD: adeg(Math.asin), acosD: adeg(Math.acos), atanD: adeg(Math.atan),
        ln: (x: number) => Math.log(x),
        logten: (x: number) => Math.log10(x),
      },
      { override: true },
    );
    return math as unknown as MathLike;
  });
  return mathPromise;
}

/** 화면에 보이는 식 → math.js 식 */
function toMath(expr: string, degMode: boolean, ans: string): string {
  let s = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/√\(/g, "sqrt(")
    .replace(/\bAns\b/g, ans ? `(${ans})` : "0")
    .replace(/\blog\(/g, "logten(");
  if (degMode) s = s.replace(/\b(a?)(sin|cos|tan)\(/g, (_m, a, f) => `${a}${f}D(`);
  else s = s.replace(/\basin\(/g, "asin(");
  return s;
}

type Hist = { expr: string; value: string };
const POS_KEY = "calcPos";

export default function Calculator({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [math, setMath] = useState<MathLike | null>(null);
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<{ dec: string; frac?: string } | null>(null);
  const [showFrac, setShowFrac] = useState(false);
  const [degMode, setDegMode] = useState(false);
  const [error, setError] = useState(false);
  const [hist, setHist] = useState<Hist[]>([]);
  const [mini, setMini] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);
  const ans = hist[0]?.value ?? "";

  useEffect(() => {
    loadMath().then(setMath);
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
      if (saved && typeof saved.x === "number") setPos(clamp(saved));
    } catch {}
  }, []);

  // 화면 크기가 바뀌어도 창이 화면 밖으로 나가지 않게
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function clamp(p: { x: number; y: number }) {
    const w = panelRef.current?.offsetWidth ?? 320;
    const h = panelRef.current?.offsetHeight ?? 60;
    return { x: Math.min(Math.max(0, p.x), window.innerWidth - w), y: Math.min(Math.max(0, p.y), window.innerHeight - Math.min(h, 120)) };
  }

  const insert = (s: string) => {
    setError(false);
    setExpr((e) => e + s);
  };

  const calc = () => {
    if (!math || !expr.trim()) return;
    try {
      const v = math.evaluate(toMath(expr, degMode, ans));
      if (typeof v !== "number" || !isFinite(v)) throw new Error("not a number");
      const dec = math.format(v, { precision: 12 });
      let frac: string | undefined;
      if (!Number.isInteger(v)) {
        const f = math.fraction(v);
        const d = Number(f.d);
        if (d <= 10000 && Math.abs(Number(f.s) * Number(f.n) / d - v) < 1e-12) frac = `${Number(f.s) < 0 ? "−" : ""}${Number(f.n)}/${d}`;
      }
      setResult({ dec, frac });
      setHist((h) => [{ expr, value: dec }, ...h].slice(0, 5));
      setExpr("");
    } catch {
      setError(true);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "=") {
      e.preventDefault();
      calc();
    } else if (e.key === "Escape") setExpr("");
  };

  // 창 윗부분을 잡고 끌어서 옮기기
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = panelRef.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setPos((p) => {
      try {
        if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
      } catch {}
      return p;
    });
  };

  const K = ({ v, label, cls, wide }: { v?: string; label: string; cls?: string; wide?: boolean }) => (
    <button type="button" className={`ck ${cls ?? ""} ${wide ? "wide" : ""}`} onClick={() => insert(v ?? label)}>
      {label}
    </button>
  );

  const shown = result ? (showFrac && result.frac ? result.frac : result.dec) : "";

  return (
    <div
      ref={panelRef}
      className={`calc ${mini ? "mini" : ""}`}
      style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
      role="dialog"
      aria-label={t.calc}
    >
      <div className="calc-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span className="calc-grip" aria-hidden>⋮⋮</span>
        <span className="calc-title">{mini && shown ? `= ${shown}` : t.calc}</span>
        <button type="button" className="calc-hbtn" onClick={() => setMini(!mini)} aria-label={mini ? t.calcOpen : t.calcMin}>
          {mini ? "⌃" : "⌄"}
        </button>
        <button type="button" className="calc-hbtn" onClick={onClose} aria-label={t.close}>✕</button>
      </div>
      {!mini && (
        <div className="calc-body">
          {hist.length > 0 && (
            <div className="calc-hist">
              {hist.slice(0, 3).reverse().map((h, i) => (
                <button key={i} type="button" onClick={() => insert(h.value)} title={t.calcUse}>
                  <span>{h.expr}</span> = <b>{h.value}</b>
                </button>
              ))}
            </div>
          )}
          <input
            className={`calc-input ${error ? "err" : ""}`}
            value={expr}
            onChange={(e) => {
              setError(false);
              setExpr(e.target.value);
            }}
            onKeyDown={onKey}
            inputMode="none"
            placeholder={math ? "0" : "…"}
            aria-label={t.calc}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="calc-result">
            {error ? <span className="err">{t.calcError}</span> : shown ? <>= {shown}</> : null}
            {result?.frac && (
              <button type="button" className="calc-frac" onClick={() => setShowFrac(!showFrac)}>
                {showFrac ? t.calcToDec : t.calcToFrac}
              </button>
            )}
          </div>
          <div className="calc-keys">
            <button type="button" className="ck fn" onClick={() => setDegMode(!degMode)}>{degMode ? "DEG" : "RAD"}</button>
            <K v="nCr(" label="nCr" cls="fn" />
            <K label="!" cls="fn" />
            <K v="^" label="xʸ" cls="fn" />
            <K v="√(" label="√" cls="fn" />

            <K v="sin(" label="sin" cls="fn" />
            <K v="cos(" label="cos" cls="fn" />
            <K v="tan(" label="tan" cls="fn" />
            <K v="ln(" label="ln" cls="fn" />
            <K v="log(" label="log" cls="fn" />

            <K label="(" cls="op" />
            <K label=")" cls="op" />
            <K label="π" cls="op" />
            <K label="e" cls="op" />
            <button type="button" className="ck ac" onClick={() => { setExpr(""); setError(false); }}>AC</button>

            <K label="7" />
            <K label="8" />
            <K label="9" />
            <K label="÷" cls="op" />
            <button type="button" className="ck ac" onClick={() => setExpr((e) => e.replace(/(Ans|sin\(|cos\(|tan\(|ln\(|log\(|nCr\(|√\(|.)$/, ""))}>⌫</button>

            <K label="4" />
            <K label="5" />
            <K label="6" />
            <K label="×" cls="op" />
            <K v="Ans" label="Ans" cls="op" />

            <K label="1" />
            <K label="2" />
            <K label="3" />
            <K label="−" cls="op" />
            <K v="," label="," cls="op" />

            <K label="0" />
            <K label="." />
            <K v="E" label="×10ˣ" cls="op" />
            <K label="+" cls="op" />
            <button type="button" className="ck eq" onClick={calc}>=</button>
          </div>
        </div>
      )}
    </div>
  );
}
