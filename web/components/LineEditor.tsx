"use client";

import { useEffect, useRef, useState } from "react";
import Tex from "./Tex";
import MathInput from "./MathInput";
import { useLang } from "@/lib/i18n";

type Props = {
  line: number;
  initial: string;
  recognized?: string;
  onSave: (text: string | null) => void;
  onClose: () => void;
};

/** 줄 번호를 누르면 뜨는 키보드 입력창. Mathpix 없이 테스트하거나 인식 오류를 고칠 때 사용 */
export default function LineEditor({ line, initial, recognized, onSave, onClose }: Props) {
  const { t } = useLang();
  const [text, setText] = useState(initial);
  const [raw, setRaw] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <div className="modal-bg" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(text.trim() ? text.trim() : null);
        }}
      >
        <h2>{t.lineInput(line + 1)}</h2>
        {raw ? (
          <>
            <p className="modal-help">{t.example} <code>4x-8=2x+6</code>, <code>x/3=3</code>, <code>\frac{"{x}{3}"}=3</code></p>
            <input
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder={t.linePlaceholder}
            />
            <div className="modal-preview">{text.trim() ? <Tex tex={text} /> : <span className="muted">{t.preview}</span>}</div>
          </>
        ) : (
          <>
            <p className="modal-help">{t.mathKbHelp}</p>
            <MathInput value={text} onChange={setText} onSubmit={() => onSave(text.trim() ? text.trim() : null)} autoFocus />
          </>
        )}
        <button type="button" className="link raw-toggle" onClick={() => setRaw(!raw)}>
          {raw ? t.useMathKb : t.useRaw}
        </button>
        {recognized && recognized !== text && (
          <button type="button" className="link" onClick={() => setText(recognized)}>
            {t.useRecognized} <Tex tex={recognized} />
          </button>
        )}
        <div className="modal-actions">
          {initial && (
            <button type="button" className="ghost" onClick={() => onSave(null)}>
              {t.clearInput}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="primary">
            {t.ok}
          </button>
        </div>
      </form>
    </div>
  );
}
