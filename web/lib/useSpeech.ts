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
