"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "./i18n";

const LOCALE: Record<Lang, string> = { en: "en-US", ko: "ko-KR" };

// 브라우저 내장 음성 인식 (Safari/Chrome: webkitSpeechRecognition). 서버 비용 없음.
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechError = "denied" | "no_speech" | "fail";

function getCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(onText: (text: string, final: boolean) => void, lang: Lang) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);
  const recRef = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => setSupported(getCtor() !== null), []);
  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = LOCALE[lang];
    rec.interimResults = true;
    rec.continuous = false;
    let text = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) text += r[0].transcript;
        else interim += r[0].transcript;
      }
      cb.current((text + interim).trim(), false);
    };
    rec.onerror = (e) => {
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error === "no-speech" ? "no_speech" : "fail");
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (text.trim()) cb.current(text.trim(), true);
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
      setError("fail");
    }
  }, [lang]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported, listening, error, start, stop };
}

/** 답변 읽어주기 (브라우저 내장 TTS) */
export function speak(text: string, lang: Lang) {
  speakQueue([text], () => {}, lang);
}

/** LaTeX 수식을 읽기 좋은 문장으로 (예: \frac{x}{3} → "x over 3" / "3분의 엑스") */
export function latexToSpeech(src: string, lang: Lang): string {
  const W =
    lang === "en"
      ? { frac: (a: string, b: string) => ` ${a} over ${b} `, times: " times ", div: " divided by ", open: " open bracket ", close: " close bracket ", eq: " equals ", plus: " plus ", minus: " minus ", x: " x " }
      : { frac: (a: string, b: string) => ` ${b}분의 ${a} `, times: " 곱하기 ", div: " 나누기 ", open: " 괄호 ", close: " 괄호 닫고 ", eq: " 은 ", plus: " 더하기 ", minus: " 빼기 ", x: "엑스" };
  let s = src.replace(/\\textcolor\{[^}]*\}/g, "").replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, lang === "en" ? " $1 choose $2 " : " $1 C $2 ").replace(/\\sum_\{([^{}]*)\}\^\{?([^{}\s]*)\}?/g, lang === "en" ? " the sum from $1 to $2 of " : " $1 부터 $2 까지의 합 ");
  for (let i = 0; i < 5; i++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => W.frac(a, b));
  s = s
    .replace(/\\left|\\right/g, "")
    .replace(/\\(cdot|times)|×/g, W.times)
    .replace(/\\div|÷/g, W.div)
    .replace(/[{}]/g, " ")
    .replace(/\(/g, W.open)
    .replace(/\)/g, W.close)
    .replace(/=/g, W.eq)
    .replace(/\+/g, W.plus)
    .replace(/[-−]/g, W.minus)
    // (사파리 16.3은 정규식 lookbehind를 못 읽어서 앞 글자를 잡아 되돌려 넣음)
    .replace(/(^|[^a-zA-Z\\])x(?![a-zA-Z])/g, (_m, pre: string) => pre + W.x)
    .replace(/\\[a-zA-Z]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** 글 속 $수식$ 부분만 말로 바꿈 */
export function speakable(text: string, lang: Lang): string {
  return text.replace(/\$+([^$]+)\$+/g, (_, m) => " " + latexToSpeech(m, lang) + " ");
}

let queueToken = 0;

/** 여러 문장을 차례로 읽고, 지금 읽는 번호를 알려준다 */
export function speakQueue(texts: string[], onIndex: (i: number | null) => void, lang: Lang) {
  if (!canSpeak()) return;
  const token = ++queueToken;
  window.speechSynthesis.cancel();
  const next = (i: number) => {
    if (token !== queueToken) return;
    if (i >= texts.length) return onIndex(null);
    onIndex(i);
    const u = new SpeechSynthesisUtterance(texts[i]);
    u.lang = LOCALE[lang];
    u.rate = 0.95;
    u.onend = () => setTimeout(() => next(i + 1), 250);
    u.onerror = () => onIndex(null);
    window.speechSynthesis.speak(u);
  };
  next(0);
}

export function stopSpeaking() {
  queueToken++;
  if (canSpeak()) window.speechSynthesis.cancel();
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
