"use client";

import { useEffect, useRef, useState } from "react";
import Tex from "./Tex";

type Props = {
  line: number;
  initial: string;
  recognized?: string;
  onSave: (text: string | null) => void;
  onClose: () => void;
};

/** 줄 번호를 누르면 뜨는 키보드 입력창. Mathpix 없이 테스트하거나 인식 오류를 고칠 때 사용 */
export default function LineEditor({ line, initial, recognized, onSave, onClose }: Props) {
  const [text, setText] = useState(initial);
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
        <h2>{line + 1}번 줄 입력</h2>
        <p className="modal-help">예: <code>4x-8=2x+6</code>, <code>x/3=3</code>, <code>\frac{"{x}{3}"}=3</code></p>
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="이 줄의 식"
        />
        <div className="modal-preview">{text.trim() ? <Tex tex={text} /> : <span className="muted">미리보기</span>}</div>
        {recognized && recognized !== text && (
          <button type="button" className="link" onClick={() => setText(recognized)}>
            손글씨 인식 결과 쓰기: <Tex tex={recognized} />
          </button>
        )}
        <div className="modal-actions">
          {initial && (
            <button type="button" className="ghost" onClick={() => onSave(null)}>
              입력 지우기
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary">
            확인
          </button>
        </div>
      </form>
    </div>
  );
}
