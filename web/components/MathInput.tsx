"use client";

import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";

/* <math-field> 커스텀 엘리먼트를 JSX에서 쓰기 위한 타입 */
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement> & { "math-virtual-keyboard-policy"?: string };
    }
  }
}

let loaded: Promise<void> | null = null;

/** MathLive 전용 표기(\\mleft, 빈 칸 \\placeholder{})를 일반 LaTeX로 (KaTeX·SymPy 호환) */
const norm = (v: string) =>
  v.replace(/\\mleft/g, "\\left").replace(/\\mright/g, "\\right").replace(/\\placeholder(\[[^\]]*\])?\{[^{}]*\}/g, "");

/** MathLive는 브라우저에서만 불러옴. 폰트는 public/mathlive/fonts, 효과음은 끔 */
function loadMathLive() {
  loaded ??= import("mathlive").then(({ MathfieldElement }) => {
    MathfieldElement.fontsDirectory = "/mathlive/fonts";
    MathfieldElement.soundsDirectory = null;
    const kb = window.mathVirtualKeyboard;
    kb.layouts = [
      {
        label: "∑ IB",
        tooltip: "Maths",
        rows: [
          ["n", "k", "r", "x", "+", "-", "\\times", "\\div", "=", { label: "⌫", command: ["performWithFeedback", "deleteBackward"], width: 1.5 }],
          [
            { latex: "\\frac{#@}{#?}", label: "a/b" },
            { latex: "#@^{#?}", label: "xⁿ" },
            { latex: "#@^{2}", label: "x²" },
            { latex: "\\sqrt{#0}", label: "√" },
            "(",
            ")",
            { latex: "\\sum_{#?}^{#?}", label: "Σ" },
            { latex: "\\binom{#?}{#?}", label: "nCr" },
            "!",
            { latex: "#@_{#?}", label: "aₙ" },
          ],
          ["<", ">", "\\le", "\\ge", "\\neq", "\\in", { latex: "\\mathbb{Z}^+", label: "ℤ⁺" }, { latex: "\\mathbb{R}", label: "ℝ" },
            { label: "abc", tooltip: "words", command: ["switchMode", "text"] }, { label: "∑x", tooltip: "maths", command: ["switchMode", "math"] }],
          ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", ".", { label: "◀", command: ["performWithFeedback", "moveToPreviousChar"] },
            { label: "▶", command: ["performWithFeedback", "moveToNextChar"] }],
        ],
      },
      "alphabetic",
      "greek",
    ];
  });
  return loaded;
}

type Props = { value: string; onChange: (latex: string) => void; onSubmit?: () => void; autoFocus?: boolean; placeholder?: string };

/** 수식 모양 그대로 입력하는 칸 + 수학 기호 키보드 (MathLive) */
export default function MathInput({ value, onChange, onSubmit, autoFocus, placeholder }: Props) {
  const ref = useRef<MathfieldElement>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef({ onChange, onSubmit });
  cb.current = { onChange, onSubmit };

  useEffect(() => {
    let alive = true;
    loadMathLive().then(() => alive && setReady(true));
    return () => {
      alive = false;
      // 화면을 떠날 때 수식 키보드가 남아서 다른 화면의 버튼을 가리지 않게
      window.mathVirtualKeyboard?.hide({ animate: false });
    };
  }, []);

  useEffect(() => {
    const mf = ref.current;
    if (!ready || !mf) return;
    mf.smartFence = true;
    mf.value = value;
    if (placeholder) mf.placeholder = placeholder;
    // \mleft( 같은 MathLive 전용 명령은 일반 LaTeX로 바꿔서 넘김 (KaTeX·SymPy 호환)
    const onInput = () => cb.current.onChange(norm(mf.value));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        cb.current.onSubmit?.();
      }
    };
    mf.addEventListener("input", onInput);
    mf.addEventListener("keydown", onKey);
    if (autoFocus) setTimeout(() => mf.focus(), 50);
    return () => {
      mf.removeEventListener("input", onInput);
      mf.removeEventListener("keydown", onKey);
    };
    // value는 처음에만 넣음 (입력 중 커서 튐 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 바깥에서 값을 바꾼 경우(예: 인식 결과 쓰기)에만 반영
  useEffect(() => {
    const mf = ref.current;
    if (ready && mf && norm(mf.value) !== value) mf.value = value;
  }, [value, ready]);

  if (!ready) return <div className="math-input loading">…</div>;
  return <math-field ref={ref} className="math-input" math-virtual-keyboard-policy="auto" />;
}
