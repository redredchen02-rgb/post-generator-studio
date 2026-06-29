/**
 * Parse a pasted text leaderboard into a `keyword -> 1-based rank` map for the
 * hotspot ranker. The sidecar's `parse_leaderboard` lives on the (deferred) Telegram
 * path, so the manual-paste flow needs its own parser here.
 *
 * Accepted line shapes (one entry per line):
 *   "1. 关键词"  "1、关键词"  "1 关键词"  "1) 关键词"  "１．关键词"  (full-width)  "关键词"
 * A line with no leading number takes its position among kept entries as its rank.
 * Blank lines are skipped; duplicate keywords keep the first occurrence. Nothing is
 * silently swallowed — dropped/odd lines are reported in `warnings`.
 */

export type ParsedLeaderboard = {
  ranking: Record<string, number>;
  warnings: string[];
};

const FULLWIDTH_DIGITS = "０１２３４５６７８９";

function normalizeDigits(s: string): string {
  return s.replace(/[０-９]/g, (d) => String(FULLWIDTH_DIGITS.indexOf(d)));
}

// Optional leading rank: digits then EITHER a non-dot separator (、 ， : ) 。 -), a
// DOT separator NOT followed by a digit, or whitespace. The dot lookahead stops a
// decimal like "1.5 甲" from being read as rank 1 + keyword "5 甲" (silent
// corruption); such lines fall back to a bare keyword with a positional rank. Still
// handles "1.甲" (no space) and "2025年发布" (digits that aren't a rank).
const LINE_RE = /^\s*(?:([0-9０-９]+)\s*(?:[、，:：)）\-]\s*|[.．。](?![0-9０-９])\s*|\s+))?(.+?)\s*$/;

export function parseLeaderboard(text: string): ParsedLeaderboard {
  const ranking: Record<string, number> = {};
  const warnings: string[] = [];
  const seen = new Set<string>();
  let position = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = LINE_RE.exec(line);
    const keyword = (m?.[2] ?? line).trim();
    if (!keyword) {
      warnings.push(`忽略无关键词的行：「${rawLine}」`);
      continue;
    }
    if (seen.has(keyword)) {
      warnings.push(`重复关键词，已保留首次：「${keyword}」`);
      continue;
    }

    position += 1;
    const explicit = m?.[1] ? Number(normalizeDigits(m[1])) : undefined;
    const rank = explicit && explicit > 0 ? explicit : position;
    seen.add(keyword);
    ranking[keyword] = rank;
  }

  return { ranking, warnings };
}
