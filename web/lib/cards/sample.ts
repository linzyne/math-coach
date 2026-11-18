// 처음 써 보는 사람을 위한 스페인어 예제 덱
import type { Collection } from "./types";
import type { Lang } from "@/lib/i18n";
import { addNote, ensureDeck } from "./collection";

export function addSampleDeck(col: Collection, lang: Lang) {
  const ko = lang === "ko";
  const vocab = ensureDeck(col, ko ? "예제::단어" : "Sample::Vocabulary");
  const grammar = ensureDeck(col, ko ? "예제::문법" : "Sample::Grammar");
  const words: [string, string, string][] = [
    ["hola", ko ? "안녕" : "hello", "greetings"],
    ["gracias", ko ? "고마워요" : "thank you", "greetings"],
    ["el libro", ko ? "책" : "the book", "nouns"],
    ["la casa", ko ? "집" : "the house", "nouns"],
    ["comer", ko ? "먹다" : "to eat", "verbs"],
    ["hablar", ko ? "말하다" : "to speak", "verbs"],
    ["rápido", ko ? "빠른" : "fast", "adjectives"],
    ["¿Dónde está el baño?", ko ? "화장실이 어디예요?" : "Where is the bathroom?", "phrases"],
  ];
  // 기본+뒤집기: 스페인어 → 뜻, 뜻 → 스페인어 두 장씩
  for (const [es, mean, tag] of words) addNote(col, "reversed", { front: es, back: mean }, [tag], vocab.id);
  const cloze: [string, string][] = [
    ["Yo {{c1::hablo}}, tú {{c2::hablas}}, él {{c3::habla}} (hablar)", ko ? "-ar 동사 현재형" : "-ar verbs, present tense"],
    ["Yo {{c1::soy}} estudiante. Yo {{c2::estoy}} cansado.", ko ? "ser: 신분·성질 / estar: 상태·위치" : "ser: identity / estar: state, location"],
    ["{{c1::El}} libro, {{c2::la}} mesa, {{c3::los}} perros", ko ? "정관사: el, la, los, las" : "Definite articles: el, la, los, las"],
  ];
  for (const [text, extra] of cloze) addNote(col, "cloze", { front: text, back: "", extra }, ["grammar"], grammar.id);
}
