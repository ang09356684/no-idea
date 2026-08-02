/**
 * Normalize a name for dedup comparison:
 * - lowercase
 * - remove whitespace, punctuation, special chars
 * - normalize Chinese brackets
 *
 * 獨立成一支的原因：client 端（BrowseList 併口袋名單）也要用同一套規則，
 * 而 combine.ts 會連帶 import fs，不能進瀏覽器 bundle。
 */
export function normalizeForDedup(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "") // remove all whitespace
    .replace(/[《》「」【】〈〉（）()[\]：:，,。.、／/\-—～~！!？?]/g, "") // remove punctuation
    .replace(/&amp;/g, "");
}
