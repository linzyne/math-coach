"use client";

/** 화면을 그리다가 오류가 나면 흰 화면 대신 오류 내용과 다시 시도 버튼을 보여줌 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="home">
      <h1>⚠ Something went wrong</h1>
      <pre className="error-pre">{error.message}{"\n"}{typeof navigator !== "undefined" ? navigator.userAgent : ""}</pre>
      <button className="primary" onClick={reset}>Try again</button>
    </main>
  );
}
