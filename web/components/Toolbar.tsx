"use client";

import type { Tool } from "./InkCanvas";
import { useLang } from "@/lib/i18n";

type Props = {
  tool: Tool;
  setTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  calcOpen: boolean;
  onCalc: () => void;
  allowTouch: boolean;
  setAllowTouch: (v: boolean) => void;
};

export default function Toolbar(p: Props) {
  const { t } = useLang();
  return (
    <div className="toolbar" role="toolbar" aria-label={t.tools}>
      <div className="seg">
        <button className={p.tool === "pen" ? "on" : ""} onClick={() => p.setTool("pen")} aria-pressed={p.tool === "pen"}>
          {t.pen}
        </button>
        <button className={p.tool === "eraser" ? "on" : ""} onClick={() => p.setTool("eraser")} aria-pressed={p.tool === "eraser"}>
          {t.eraser}
        </button>
      </div>
      <div className="seg">
        <button onClick={p.onUndo} disabled={!p.canUndo} aria-label={t.undo}>{t.undo}</button>
        <button onClick={p.onRedo} disabled={!p.canRedo} aria-label={t.redo}>{t.redo}</button>
      </div>
      <button className="ghost" onClick={p.onClear}>{t.clearAll}</button>
      <button className={`ghost calc-btn ${p.calcOpen ? "on" : ""}`} onClick={p.onCalc} aria-pressed={p.calcOpen}>
        {t.calc}
      </button>
      <label className="touch-toggle">
        <input type="checkbox" checked={p.allowTouch} onChange={(e) => p.setAllowTouch(e.target.checked)} />
        {t.fingerDraw}
      </label>
    </div>
  );
}
