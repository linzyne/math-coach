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
  const idx = PROBLEMS.findIndex((p) => p.id === id);
  return (
    <main className="solve">
      <SolveHeader no={idx + 1} latex={problem.latex} />
      <SolveBoard problemId={problem.id} problemLatex={problem.latex} nextId={PROBLEMS[idx + 1]?.id ?? null} />
    </main>
  );
}
