"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point, Stroke } from "@/lib/ink/types";
import type { InkAction } from "@/lib/ink/history";
import { LINE_HEIGHT, TOP_MARGIN, hitsStroke, lineOf, widthFor } from "@/lib/ink/geometry";

export type Tool = "pen" | "eraser";

type Props = {
  strokes: Stroke[];
  dispatch: (a: InkAction) => void;
  tool: Tool;
  /** true면 손가락으로도 필기 (펜이 없는 기기에서 테스트용) */
  allowTouch: boolean;
  lineCount: number;
  /** 손가락 스크롤을 직접 처리할 스크롤 컨테이너 */
  scrollRef: React.RefObject<HTMLElement | null>;
  onActiveLine?: (line: number | null) => void;
};

const INK = "#1f2a44";
const ERASER_RADIUS = 14;

let idSeq = 0;
const newId = () => `${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

function setupCanvas(c: HTMLCanvasElement, w: number, h: number) {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return ctx;
}

function drawSegment(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  ctx.lineWidth = widthFor((a.p + b.p) / 2);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, pts: Point[]) {
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, widthFor(pts[0].p) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < pts.length; i++) drawSegment(ctx, pts[i - 1], pts[i]);
}

export default function InkCanvas({ strokes, dispatch, tool, allowTouch, lineCount, scrollRef, onActiveLine }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const height = lineCount * LINE_HEIGHT + TOP_MARGIN * 2;

  // 진행 중인 입력 상태 (렌더링과 무관하므로 ref)
  const active = useRef<{
    id: number;
    kind: "draw" | "erase" | "scroll";
    points: Point[];
    lastY: number;
  } | null>(null);
  const [pendingErase, setPendingErase] = useState<Set<string>>(new Set());
  const pendingEraseRef = useRef<Set<string>>(new Set());

  // 크기 추적
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 확정된 획 다시 그리기
  useEffect(() => {
    const c = baseRef.current;
    if (!c || width === 0) return;
    const ctx = setupCanvas(c, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    for (const s of strokes) {
      if (pendingErase.has(s.id)) continue;
      drawStroke(ctx, s.points);
    }
  }, [strokes, width, height, pendingErase]);

  useEffect(() => {
    const c = liveRef.current;
    if (!c || width === 0) return;
    const ctx = setupCanvas(c, width, height);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
  }, [width, height]);

  // iOS 사파리: 길게 누를 때 돋보기/선택 메뉴, 더블탭 확대 차단
  useEffect(() => {
    const c = liveRef.current;
    if (!c) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    c.addEventListener("touchstart", prevent, { passive: false });
    c.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      c.removeEventListener("touchstart", prevent);
      c.removeEventListener("touchmove", prevent);
    };
  }, []);

  const toPoint = useCallback((e: PointerEvent | React.PointerEvent): Point => {
    const r = liveRef.current!.getBoundingClientRect();
    let p = e.pressure;
    if (e.pointerType !== "pen" || p === 0) p = 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, p };
  }, []);

  const eraseAt = useCallback(
    (pt: Point) => {
      let changed = false;
      for (const s of strokes) {
        if (pendingEraseRef.current.has(s.id)) continue;
        if (hitsStroke(s.points, pt.x, pt.y, ERASER_RADIUS)) {
          pendingEraseRef.current.add(s.id);
          changed = true;
        }
      }
      if (changed) setPendingErase(new Set(pendingEraseRef.current));
    },
    [strokes],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const isTouch = e.pointerType === "touch";
    if (active.current) {
      // 펜이 쓰는 중이면 손바닥/다른 손가락은 무시
      return;
    }
    if (isTouch && !allowTouch) {
      // 손바닥/손가락: 필기하지 않고 스크롤만
      active.current = { id: e.pointerId, kind: "scroll", points: [], lastY: e.clientY };
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // 일부 스타일러스의 지우개 버튼(buttons=32)도 지우개로 처리
    const erasing = tool === "eraser" || (e.buttons & 32) === 32;
    const pt = toPoint(e);
    if (erasing) {
      active.current = { id: e.pointerId, kind: "erase", points: [pt], lastY: e.clientY };
      eraseAt(pt);
    } else {
      active.current = { id: e.pointerId, kind: "draw", points: [pt], lastY: e.clientY };
      const ctx = liveRef.current!.getContext("2d")!;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, widthFor(pt.p) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    onActiveLine?.(lineOf([pt]));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    if (a.kind === "scroll") {
      const sc = scrollRef.current;
      if (sc) sc.scrollTop -= e.clientY - a.lastY;
      a.lastY = e.clientY;
      return;
    }
    const native = e.nativeEvent;
    const evs = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const list = evs.length ? evs : [native];
    if (a.kind === "erase") {
      for (const ev of list) eraseAt(toPoint(ev));
      return;
    }
    const ctx = liveRef.current!.getContext("2d")!;
    for (const ev of list) {
      const pt = toPoint(ev);
      const last = a.points[a.points.length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.6) continue;
      drawSegment(ctx, last, pt);
      a.points.push(pt);
    }
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    onActiveLine?.(null);
    if (a.kind === "draw") {
      const stroke: Stroke = { id: newId(), points: a.points, line: lineOf(a.points) };
      // 확정 캔버스에 바로 그려서 깜빡임 방지
      const base = baseRef.current!.getContext("2d")!;
      drawStroke(base, stroke.points);
      liveRef.current!.getContext("2d")!.clearRect(0, 0, width, height);
      dispatch({ type: "do", op: { kind: "add", strokes: [stroke] } });
    } else if (a.kind === "erase") {
      const ids = pendingEraseRef.current;
      const erased = strokes.filter((s) => ids.has(s.id));
      pendingEraseRef.current = new Set();
      setPendingErase(new Set());
      dispatch({ type: "do", op: { kind: "erase", strokes: erased } });
    }
  };

  return (
    <div ref={wrapRef} className="ink-wrap" style={{ height }}>
      <canvas ref={baseRef} className="ink-layer" />
      <canvas
        ref={liveRef}
        className={`ink-layer ink-input ${tool === "eraser" ? "is-eraser" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
