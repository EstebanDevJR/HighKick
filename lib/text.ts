// Accent/case-insensitive matching shared by the search index (server) and
// the library filter (client), so "pokemon" finds "Pokémon" everywhere.

export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// 0 means no match. Exact > prefix > word-prefix > substring > in-order
// subsequence, with shorter targets winning ties so "xqc" beats "xqcfan".
export function matchScore(query: string, target: string): number {
  const q = foldText(query);
  const t = foldText(target);
  if (!q || !t) return 0;
  const brevity = 1 / (1 + t.length / 40);
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 + 10 * brevity;
  const compactT = t.replace(/[\s_-]+/g, "");
  const compactQ = q.replace(/[\s_-]+/g, "");
  if (compactQ && compactT.startsWith(compactQ)) return 75 + 10 * brevity;
  if (t.split(/[\s_\-:|/]+/).some((w) => w.startsWith(q))) return 60 + 10 * brevity;
  if (t.includes(q)) return 40 + 10 * brevity;
  if (q.length >= 3) {
    let i = 0;
    for (const ch of compactT) {
      if (ch === compactQ[i]) i++;
      if (i === compactQ.length) return 15 + 10 * brevity;
    }
  }
  return 0;
}
