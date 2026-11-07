"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import SolveBoard from "./SolveBoard";
import SolveHeader from "./SolveHeader";
import { loadCustom, toProblem, type CustomProblem } from "@/lib/customProblems";
import { useLang } from "@/lib/i18n";

/** 학생이 추가한 문제 풀이 화면 (문제는 기기에 저장되어 있음) */
export default function CustomSolve() {
  const id = useSearchParams().get("id");
  const { t } = useLang();
  const [state, setState] = useState<{ list: CustomProblem[]; ready: boolean }>({ list: [], ready: false });
  useEffect(() => setState({ list: loadCustom(), ready: true }), []);

  if (!state.ready) return null;
  const idx = state.list.findIndex((p) => p.id === id);
  const custom = state.list[idx];
  if (!custom)
    return (
      <main className="home">
        <p>404</p>
        <Link href="/" className="primary">{t.toList}</Link>
      </main>
    );
  const problem = toProblem(custom);
  const next = state.list[idx + 1];
  return (
    <main className="solve">
      <SolveHeader no={idx + 1} statement={problem.statement} kind={problem.kind} />
      <SolveBoard key={custom.id} problemId={custom.id} problem={problem} nextId={null} nextHref={next ? `/solve/custom?id=${next.id}` : null} />
    </main>
  );
}
