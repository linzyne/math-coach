import Link from "next/link";
import { notFound } from "next/navigation";
import SolveBoard from "@/components/SolveBoard";
import Tex from "@/components/Tex";
import { PROBLEMS, getProblem } from "@/lib/problems";

export function generateStaticParams() {
  return PROBLEMS.map((p) => ({ id: p.id }));
}

export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const problem = getProblem(id);
  if (!problem) notFound();
  const idx = PROBLEMS.findIndex((p) => p.id === id);
  return (
    <main className="solve">
      <header className="solve-head">
        <Link href="/" className="back">← 목록</Link>
        <div className="problem">
          <span className="problem-no">문제 {idx + 1}</span>
          <Tex tex={problem.latex} display />
        </div>
        <span className="hint-hint">한 줄에 한 단계씩 써 보세요</span>
      </header>
      <SolveBoard problemId={problem.id} problemLatex={problem.latex} nextId={PROBLEMS[idx + 1]?.id ?? null} />
    </main>
  );
}
