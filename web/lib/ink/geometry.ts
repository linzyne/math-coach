import type { Point } from "./types";

export const LINE_HEIGHT = 96; // CSS px, 한 줄 높이
export const TOP_MARGIN = 8;

/** 획의 세로 중앙값으로 줄 번호를 정한다. "=" 처럼 납작한 획도 안정적으로 배정됨 */
export function lineOf(points: Point[]): number {
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  const mid = ys[Math.floor(ys.length / 2)] ?? 0;
  return Math.max(0, Math.floor((mid - TOP_MARGIN) / LINE_HEIGHT));
}

function distToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function hitsStroke(points: Point[], x: number, y: number, r: number): boolean {
  if (points.length === 1) return Math.hypot(points[0].x - x, points[0].y - y) <= r;
  for (let i = 1; i < points.length; i++) {
    if (distToSegment(x, y, points[i - 1], points[i]) <= r) return true;
  }
  return false;
}

export function widthFor(p: number, base = 2.6): number {
  return base * (0.45 + Math.min(1, Math.max(0, p)) * 0.95);
}
