// 처음 써 보는 사람을 위한 예제 덱
import type { Collection } from "./types";
import type { Lang } from "@/lib/i18n";
import { addNote, ensureDeck } from "./collection";

export function addSampleDeck(col: Collection, lang: Lang) {
  const ko = lang === "ko";
  const math = ensureDeck(col, ko ? "예제::수학 공식" : "Sample::Math formulas");
  const words = ensureDeck(col, ko ? "예제::영어 단어" : "Sample::Vocabulary");
  const basic: [string, string, string[]][] = [
    [ko ? "이차방정식 $ax^2+bx+c=0$ 의 근의 공식" : "Quadratic formula for $ax^2+bx+c=0$", "$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$", ["algebra"]],
    [ko ? "$\\dfrac{d}{dx}\\sin x$" : "$\\dfrac{d}{dx}\\sin x$", "$\\cos x$", ["calculus"]],
    [ko ? "$\\displaystyle\\int \\frac{1}{x}\\,dx$" : "$\\displaystyle\\int \\frac{1}{x}\\,dx$", "$\\ln|x| + C$", ["calculus"]],
    [ko ? "등비수열의 합 $S_n$ ($r\\neq1$)" : "Sum of a geometric series $S_n$ ($r\\neq1$)", "$$S_n=\\frac{u_1(1-r^n)}{1-r}$$", ["sequences"]],
  ];
  for (const [f, b, tags] of basic) addNote(col, "basic", { front: f, back: b }, tags, math.id);
  addNote(col, "cloze", {
    front: ko ? "이항정리: $(a+b)^n = \\sum_{r=0}^{n} {{c1::\\binom{n}{r}}} a^{ {{c2::n-r}} } b^r$" : "Binomial theorem: $(a+b)^n = \\sum_{r=0}^{n} {{c1::\\binom{n}{r}}} a^{ {{c2::n-r}} } b^r$",
    back: "",
    extra: ko ? "IB AA HL 공식집에 있어요" : "In the IB AA HL formula booklet",
  }, ["binomial"], math.id);
  addNote(col, "cloze", {
    front: ko ? "수학적 귀납법은 {{c1::기본 단계}}와 {{c2::귀납 단계}}로 이루어진다." : "Proof by induction has a {{c1::base case}} and an {{c2::inductive step}}.",
    back: "",
  }, ["induction"], math.id);
  const vocab: [string, string][] = ko
    ? [["ephemeral", "덧없는, 잠깐의"], ["meticulous", "꼼꼼한, 세심한"], ["ubiquitous", "어디에나 있는"], ["resilient", "회복력 있는"]]
    : [["ephemeral", "lasting a very short time"], ["meticulous", "very careful and precise"], ["ubiquitous", "found everywhere"], ["resilient", "able to recover quickly"]];
  for (const [f, b] of vocab) addNote(col, "reversed", { front: f, back: b }, ["vocab"], words.id);
}
