/**
 * Claude 응답(풀이·힌트)을 기기에 저장해서 같은 요청은 다시 돈을 쓰지 않게 한다.
 * 오래된 것부터 지워서 최대 MAX개만 유지.
 */
const PREFIX = "cc:";
const INDEX = "cc-index";
const MAX = 300;

function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + hash(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown) {
  try {
    const id = hash(key);
    const index: string[] = JSON.parse(localStorage.getItem(INDEX) ?? "[]").filter((x: string) => x !== id);
    index.push(id);
    while (index.length > MAX) localStorage.removeItem(PREFIX + index.shift());
    localStorage.setItem(PREFIX + id, JSON.stringify(value));
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {}
}
