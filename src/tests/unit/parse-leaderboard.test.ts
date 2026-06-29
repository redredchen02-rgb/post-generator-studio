import { describe, expect, it } from "vitest";
import { parseLeaderboard } from "@/presentation/hotspot/parse-leaderboard";

describe("parseLeaderboard", () => {
  it("parses numbered lines into keyword -> rank", () => {
    const { ranking } = parseLeaderboard("1. 大杨嫂\n2. 新词\n3. 旧词");
    expect(ranking).toEqual({ 大杨嫂: 1, 新词: 2, 旧词: 3 });
  });

  it("accepts assorted separators and bare keywords", () => {
    const { ranking } = parseLeaderboard("1、甲\n2) 乙\n丙");
    expect(ranking).toEqual({ 甲: 1, 乙: 2, 丙: 3 });
  });

  it("normalizes full-width digits", () => {
    const { ranking } = parseLeaderboard("１．甲\n２．乙");
    expect(ranking).toEqual({ 甲: 1, 乙: 2 });
  });

  it("skips blank lines without consuming a position", () => {
    const { ranking } = parseLeaderboard("甲\n\n  \n乙");
    expect(ranking).toEqual({ 甲: 1, 乙: 2 });
  });

  it("keeps the first of a duplicate keyword and warns", () => {
    const { ranking, warnings } = parseLeaderboard("1. 甲\n2. 甲\n3. 乙");
    expect(ranking).toEqual({ 甲: 1, 乙: 3 });
    expect(warnings.some((w) => w.includes("重复"))).toBe(true);
  });

  it("falls back to position when a rank is missing", () => {
    const { ranking } = parseLeaderboard("甲\n乙\n丙");
    expect(ranking).toEqual({ 甲: 1, 乙: 2, 丙: 3 });
  });

  it("returns an empty ranking for blank input", () => {
    expect(parseLeaderboard("\n  \n").ranking).toEqual({});
  });

  it("preserves an explicit non-sequential rank", () => {
    const { ranking } = parseLeaderboard("5. 甲\n9. 乙");
    expect(ranking).toEqual({ 甲: 5, 乙: 9 });
  });
});
