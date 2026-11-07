import katex from "katex";

const STRONG = /[\\^_]|[=<>≤≥]/; // 확실히 수식인 조각
/** 수식 옆에 있으면 수식으로 묶을 조각: 연산자, 숫자, 한 글자 변수, (k+1) 같은 짧은 식 */
function isWeak(c: string): boolean {
  if (/^[-+×÷·*/=<>≤≥]$/.test(c)) return true;
  if (/^\d+(\.\d+)?$/.test(c)) return true;
  if (/^[b-zB-HJ-Z]$/.test(c)) return true; // a, I 는 영어 단어라서 제외
  if (/^\d+[a-zA-Z]$/.test(c)) return true; // 2k, 3x
  if (/^\(?[a-zA-Z0-9]*[-+*/][a-zA-Z0-9()+\-*/]*\)?$/.test(c) && /[0-9]|^[a-z]\W|\W[a-z]$/.test(c)) return true; // k+1, (k+1), 2k-1
  if (/^\([^()]*\)$/.test(c) && /[0-9+\-]/.test(c)) return true;
  return false;
}

/**
 * Claude가 $…$를 빠뜨리고 "Split 3 \cdot 2^k into …" 처럼 쓴 경우,
 * 수식처럼 보이는 단어 묶음만 찾아 $…$로 감싼다.
 */
export function autoWrapMath(text: string): string {
  if (text.includes("$") || !STRONG.test(text.replace(/[=<>]/g, ""))) return text;
  const tokens = text.split(/(\s+)/);
  const isWord = (t: string) => t.trim().length > 0;
  const core = (t: string) => t.replace(/[.,;:!?]+$/, "");
  const strong = tokens.map((t) => isWord(t) && /[\\^_]/.test(core(t)));
  const math = strong.slice();
  // 확실한 수식 조각 양옆의 숫자·연산자·짧은 문자를 같은 수식으로 묶음
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < tokens.length; i++) {
      if (math[i] || !isWord(tokens[i])) continue;
      const c = core(tokens[i]);
      if (!isWeak(c)) continue;
      const prev = tokens.slice(0, i).map((t, j) => ({ t, j })).reverse().find((x) => isWord(x.t));
      const next = tokens.slice(i + 1).map((t, j) => ({ t, j: j + i + 1 })).find((x) => isWord(x.t));
      if ((prev && math[prev.j] && !/[.,;:!?]$/.test(tokens[prev.j])) || (next && math[next.j] && !/[.,;:!?]$/.test(tokens[i]))) {
        math[i] = true;
        changed = true;
      }
    }
  }
  let out = "";
  let run: string[] = [];
  let tail = "";
  const flush = () => {
    if (run.length) out += "$" + run.join(" ") + "$" + tail;
    run = [];
    tail = "";
  };
  tokens.forEach((t, i) => {
    if (!isWord(t)) {
      if (!run.length) out += t;
      return;
    }
    if (math[i]) {
      if (tail) flush();
      const c = core(t);
      run.push(c);
      tail = t.slice(c.length);
      if (tail) flush();
      else if (run.length && i + 1 < tokens.length) {
        // 다음 단어가 수식이 아니면 여기서 끊음
        const next = tokens.slice(i + 1).findIndex(isWord);
        if (next === -1 || !math[i + 1 + next]) flush();
      }
    } else {
      flush();
      out += (out && !/\s$/.test(out) ? " " : "") + t;
    }
  });
  flush();
  return out.replace(/\$\s+/g, "$").replace(/\$(?=[A-Za-z])/g, "$ ").replace(/ {2,}/g, " ");
}

/** "Prove that $\sum r = ...$ for all $n$" 처럼 글과 $수식$이 섞인 문장을 렌더링 */
export default function MathText({ text, className }: { text: string; className?: string }) {
  const parts = autoWrapMath(text).split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("$")) {
          const display = part.startsWith("$$");
          const tex = part.slice(display ? 2 : 1, display ? -2 : -1);
          return <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { throwOnError: false, displayMode: display }) }} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
