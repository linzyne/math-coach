export type CustomProblem = { id: string; latex: string; createdAt: number };

const KEY = "customProblems";

export function loadCustom(): CustomProblem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(list: CustomProblem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function addCustom(latexList: string[]): CustomProblem[] {
  const now = Date.now();
  const added = latexList.map((latex, i) => ({ id: `c${now.toString(36)}${i}`, latex, createdAt: now }));
  save([...loadCustom(), ...added]);
  return added;
}

export function removeCustom(id: string) {
  save(loadCustom().filter((p) => p.id !== id));
  try {
    for (const k of [`ink:${id}`, `typed:${id}`, `hints:${id}`]) localStorage.removeItem(k);
  } catch {}
}

/** 붙여넣은 글에서 한 줄에 하나씩 방정식만 골라냄 (번호·기호 제거) */
export function parsePasted(text: string): string[] {
  return text
    .split(/\r?\n|;/)
    .map((l) =>
      l
        .trim()
        .replace(/^\$+|\$+$/g, "")
        .replace(/^(\(?\s*(\d{1,3}|[a-zA-Z]|[ivx]{1,4})\s*[).:]|\d{1,3}\s*번\.?|[-•*·])\s*/, "")
        .replace(/^\\\(|\\\)$/g, "")
        .trim(),
    )
    .filter((l) => l.includes("="));
}

/** 사진을 긴 변 1600px JPEG로 줄여서 base64로 (업로드 용량·비용 절약) */
export async function imageToBase64(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}
