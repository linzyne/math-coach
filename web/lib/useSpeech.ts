"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function getCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(onText: (text: string, final: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => setSupported(getCtor() !== null), []);
  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = "ko-KR";
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
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "마이크 권한을 허용해 주세요."
          : e.error === "no-speech"
          ? "목소리가 들리지 않았어요."
          : "음성 인식에 실패했어요.",
      );
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
      setError("음성 인식을 시작하지 못했어요.");
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported, listening, error, start, stop };
}

/** 답변 읽어주기 (브라우저 내장 TTS) */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

/** LaTeX 수식을 한국어로 읽기 좋은 문장으로 (예: \frac{x}{3} → "3분의 엑스") */
export function latexToSpeech(src: string): string {
  let s = src;
  s = s.replace(/\\textcolor\{[^}]*\}/g, "");
  // 분수: 안쪽부터 반복해서 바꿈
  for (let i = 0; i < 5; i++) {
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => ` ${b}분의 ${a} `);
  }
  s = s
    .replace(/\\left|\\right/g, "")
    .replace(/\\(cdot|times)/g, " 곱하기 ")
    .replace(/\\div/g, " 나누기 ")
    .replace(/[{}]/g, " ")
    .replace(/\(/g, " 괄호 ")
    .replace(/\)/g, " 괄호 닫고 ")
    .replace(/=/g, " 은 ")
    .replace(/\+/g, " 더하기 ")
    .replace(/[-−]/g, " 빼기 ")
    .replace(/×/g, " 곱하기 ")
    .replace(/÷/g, " 나누기 ")
    .replace(/(?<![a-zA-Z\\])x(?![a-zA-Z])/g, "엑스")
    .replace(/\\[a-zA-Z]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

let queueToken = 0;

/** 여러 문장을 차례로 읽고, 지금 읽는 번호를 알려준다 */
export function speakQueue(texts: string[], onIndex: (i: number | null) => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const token = ++queueToken;
  window.speechSynthesis.cancel();
  const next = (i: number) => {
    if (token !== queueToken) return;
    if (i >= texts.length) return onIndex(null);
    onIndex(i);
    const u = new SpeechSynthesisUtterance(texts[i]);
    u.lang = "ko-KR";
    u.rate = 0.95;
    u.onend = () => setTimeout(() => next(i + 1), 250);
    u.onerror = () => onIndex(null);
    window.speechSynthesis.speak(u);
  };
  next(0);
}

export function stopSpeaking() {
  queueToken++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
