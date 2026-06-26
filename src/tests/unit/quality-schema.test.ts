import { describe, expect, it } from "vitest";
import { computeOverall, judgeReplySchema, qualityScoreSchema } from "@/domain/schemas";

const validReply = {
  relevance: { score: 5, justification: "Tight focus." },
  coherence: { score: 4, justification: "Smooth flow." },
  factuality: { score: 4, justification: "Grounded." },
  style: { score: 3, justification: "Readable." },
  completeness: { score: 4, justification: "Thorough." },
};

describe("quality schema", () => {
  it("accepts a well-formed five-dimension reply", () => {
    expect(judgeReplySchema.parse(validReply)).toEqual(validReply);
  });

  it("computes overall as the mean of the five dimensions, rounded to one decimal", () => {
    // (5+4+4+3+4)/5 = 4.0
    expect(computeOverall(validReply)).toBe(4);
    const mixed = { ...validReply, style: { score: 1, justification: "Robotic." } };
    // (5+4+4+1+4)/5 = 3.6
    expect(computeOverall(mixed)).toBe(3.6);
  });

  it("rejects a missing dimension", () => {
    const { factuality: _omit, ...partial } = validReply;
    void _omit;
    expect(() => judgeReplySchema.parse(partial)).toThrow();
  });

  it("rejects an out-of-range score", () => {
    expect(() => judgeReplySchema.parse({ ...validReply, relevance: { score: 6, justification: "x" } })).toThrow();
  });

  it("rejects a non-integer score", () => {
    expect(() => judgeReplySchema.parse({ ...validReply, relevance: { score: 4.5, justification: "x" } })).toThrow();
  });

  it("requires selfEvaluated and scoredAt on the persisted score", () => {
    expect(() => qualityScoreSchema.parse({ ...validReply, overall: 4 })).toThrow();
    const full = { ...validReply, overall: 4, selfEvaluated: true, scoredAt: "2026-06-26T00:00:00.000Z" };
    expect(qualityScoreSchema.parse(full).selfEvaluated).toBe(true);
  });
});
