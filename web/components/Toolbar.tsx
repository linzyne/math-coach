"use client";

import type { Tool } from "./InkCanvas";

type Props = {
  tool: Tool;
  setTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  allowTouch: boolean;
  setAllowTouch: (v: boolean) => void;
};

export default function Toolbar(p: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="필기 도구">
      <div className="seg">
        <button className={p.tool === "pen" ? "on" : ""} onClick={() => p.setTool("pen")} aria-pressed={p.tool === "pen"}>
          ✏️ 펜
        </button>
        <button className={p.tool === "eraser" ? "on" : ""} onClick={() => p.setTool("eraser")} aria-pressed={p.tool === "eraser"}>
          🧽 지우개
        </button>
      </div>
      <div className="seg">
        <button onClick={p.onUndo} disabled={!p.canUndo} aria-label="되돌리기">↶ 되돌리기</button>
        <button onClick={p.onRedo} disabled={!p.canRedo} aria-label="다시 실행">↷ 다시</button>
      </div>
      <button className="ghost" onClick={p.onClear}>모두 지우기</button>
      <label className="touch-toggle">
        <input type="checkbox" checked={p.allowTouch} onChange={(e) => p.setAllowTouch(e.target.checked)} />
        손가락으로도 쓰기
      </label>
    </div>
  );
}
