"use client";

import { useEffect, useState } from "react";

/**
 * 화면에 자바스크립트 오류를 빨간 띠로 보여줌 (아이패드처럼 개발자 도구가 없는 기기에서 원인 찾기용).
 * 띠를 누르면 닫힘.
 */
export default function ErrorReporter() {
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    const add = (m: string) => setErrors((e) => (e.includes(m) ? e : [...e, m].slice(-3)));
    const onError = (e: ErrorEvent) => add(`${e.message} @ ${(e.filename ?? "").split("/").pop()}:${e.lineno}`);
    const onRejection = (e: PromiseRejectionEvent) => add(`Promise: ${String(e.reason?.message ?? e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  if (errors.length === 0) return null;
  return (
    <div className="error-bar" onClick={() => setErrors([])} role="alert">
      ⚠ {errors.join(" | ")}
      <div className="error-ua">{typeof navigator !== "undefined" ? navigator.userAgent : ""}</div>
    </div>
  );
}
