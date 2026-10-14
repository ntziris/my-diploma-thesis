export const MAX_KEYWORDS = 12;
export const MAX_KEYWORD_BYTES = 32;

const encoder = new TextEncoder();

// Search finds exactly what this wrote at mint; changing it means re-indexing every work
export function normaliseKeyword(word: string): string {
  const w = word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return encoder.encode(w).length > MAX_KEYWORD_BYTES ? '' : w;
}

export function keywordsOf(...texts: string[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const raw of text.split(/[\s,.;:!?()"'«»/\\-]+/)) {
      const w = normaliseKeyword(raw);
      if (w.length >= 2 && !out.includes(w)) out.push(w);
      if (out.length >= MAX_KEYWORDS) return out;
    }
  }
  return out;
}
