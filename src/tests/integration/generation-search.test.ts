import { describe, expect, it } from "vitest";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

function genWithTitle(title: string) {
  return {
    id: createId("gen"),
    title,
    eventSummary: "summary",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "S",
    renderedUserPrompt: "U",
  };
}

async function searchTitles(search: string): Promise<string[]> {
  const { items } = await getStorage().generations.list({ search });
  return items.map((g) => g.title);
}

// Regression: list() escaped LIKE wildcards (% and _) with a backslash but never
// declared `ESCAPE '\'`, so SQLite treated the backslash as a literal — breaking
// any title search containing _ or %, and matching titles with a literal backslash.
describe("generation search LIKE escaping (integration)", () => {
  it("matches a literal underscore in the title (not as a single-char wildcard)", async () => {
    await getStorage().generations.create(genWithTitle("Q1_report_draft"));
    await getStorage().generations.create(genWithTitle("Q2 report draft")); // spaces, not underscores

    expect(await searchTitles("Q1_report")).toContain("Q1_report_draft");
    // The underscore must be literal: it must NOT match the space-separated title.
    expect(await searchTitles("Q1_report")).not.toContain("Q2 report draft");
  });

  it("matches a literal percent sign in the title", async () => {
    await getStorage().generations.create(genWithTitle("50% off sale"));
    expect(await searchTitles("50%")).toContain("50% off sale");
  });

  it("still matches ordinary substrings", async () => {
    await getStorage().generations.create(genWithTitle("ordinary plain heading"));
    expect(await searchTitles("plain")).toContain("ordinary plain heading");
  });
});
