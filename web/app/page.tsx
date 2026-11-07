import Link from "next/link";
import Tex from "@/components/Tex";
import { PROBLEMS } from "@/lib/problems";

export default function Home() {
  return (
    <main className="home">
      <h1>일차방정식 풀이 연습</h1>
      <p className="sub">문제를 고르고 애플펜슬로 한 줄씩 풀어 보세요.</p>
      <ol className="plist">
        {PROBLEMS.map((p, i) => (
          <li key={p.id}>
            <Link href={`/solve/${p.id}`} className="pcard">
              <span className="pnum">{i + 1}</span>
              <span className="ptex"><Tex tex={p.latex} /></span>
              <span className={`plevel l${p.level}`}>{p.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
