import { notFound } from "next/navigation";
import SolveBoard from "@/components/SolveBoard";
import SolveHeader from "@/components/SolveHeader";
import { PROBLEMS, getProblem } from "@/lib/problems";

export function generateStaticParams() {
  return PROBLEMS.map((p) => ({ id: p.id }));
}

export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const problem = getProblem(id);
  if (!problem) notFound();
  // 같은 단원 안에서 번호와 다음 문제
  const unit = PROBLEMS.filter((p) => p.unit === problem.unit);
  const idx = unit.findIndex((p) => p.id === id);
  return (
    <main className="solve">
      <SolveHeader no={idx + 1} statement={problem.statement} kind={problem.kind} />
      <SolveBoard problemId={problem.id} problem={problem} nextId={unit[idx + 1]?.id ?? null} />
    </main>
  );
}
