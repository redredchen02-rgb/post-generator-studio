import { stripMarkdown } from "./utils";

// CJK unified ideographs + extension A + compatibility ideographs.
const CJK_RE = /[㐀-鿿豈-﫿]/gu;
// Latin/numeric words, allowing internal apostrophes and hyphens (e.g. "don't", "state-of-art").
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
const ALNUM_RE = /[A-Za-z0-9]/g;

// Reading-speed assumptions: ~400 CJK chars/min, ~200 latin words/min.
const CJK_PER_MIN = 400;
const LATIN_WORDS_PER_MIN = 200;
// Treat content as "English" for readability only when it is overwhelmingly latin.
const ENGLISH_RATIO_THRESHOLD = 0.9;

export interface TextMetrics {
  /** Total length proxy: CJK characters + latin words. */
  words: number;
  /** CJK character count (0 for pure-latin text). */
  cjkChars: number;
  /** Estimated reading time in whole minutes (0 for empty text). */
  readingMinutes: number;
  /**
   * Automated Readability Index grade, or null when the text is not
   * predominantly English. ARI avoids syllable counting, so it stays robust
   * for the mixed/CJK content this tool usually produces.
   */
  readabilityGrade: number | null;
}

export function countCjkChars(text: string): number {
  return (text.match(CJK_RE) ?? []).length;
}

export function countLatinWords(text: string): number {
  return (text.match(LATIN_WORD_RE) ?? []).length;
}

export function countWords(text: string): number {
  return countCjkChars(text) + countLatinWords(text);
}

export function estimateReadingMinutes(text: string): number {
  const cjk = countCjkChars(text);
  const latin = countLatinWords(text);
  if (cjk + latin === 0) return 0;
  return Math.max(1, Math.ceil(cjk / CJK_PER_MIN + latin / LATIN_WORDS_PER_MIN));
}

export function isPredominantlyEnglish(text: string): boolean {
  const cjk = countCjkChars(text);
  const latin = countLatinWords(text);
  if (cjk + latin === 0) return false;
  return latin / (cjk + latin) >= ENGLISH_RATIO_THRESHOLD;
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?=\s|$)/g);
  return Math.max(1, matches?.length ?? 1);
}

/**
 * ARI grade for predominantly-English text; null otherwise. The readability
 * formula is English-tuned, so it is gated by language rather than applied
 * blindly to CJK content.
 */
export function englishReadabilityGrade(text: string): number | null {
  if (!isPredominantlyEnglish(text)) return null;
  const words = countLatinWords(text);
  if (words === 0) return null;
  const chars = (text.match(ALNUM_RE) ?? []).length;
  const sentences = countSentences(text);
  const ari = 4.71 * (chars / words) + 0.5 * (words / sentences) - 21.43;
  return Math.max(1, Math.round(ari));
}

/** Compute all editor metrics from raw markdown (strips markup once up front). */
export function computeTextMetrics(markdown: string): TextMetrics {
  const text = stripMarkdown(markdown);
  return {
    words: countWords(text),
    cjkChars: countCjkChars(text),
    readingMinutes: estimateReadingMinutes(text),
    readabilityGrade: englishReadabilityGrade(text),
  };
}
