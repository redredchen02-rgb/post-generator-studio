import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import zh from "../../../messages/zh-CN.json";

/** Recursively collect all leaf paths as dot-notation strings. */
function leafPaths(obj: unknown, prefix = ""): Set<string> {
  const paths = new Set<string>();
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const sub of leafPaths(value, p)) paths.add(sub);
      } else {
        paths.add(p);
      }
    }
  }
  return paths;
}

describe("i18n parity", () => {
  it("en and zh-CN have exactly the same key set", () => {
    const enKeys = leafPaths(en);
    const zhKeys = leafPaths(zh);

    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    const extraInZh = [...zhKeys].filter((k) => !enKeys.has(k));

    expect(missingInZh, `Keys present in en.json but missing in zh-CN.json:\n  ${missingInZh.join("\n  ")}`).toEqual([]);
    expect(extraInZh, `Keys present in zh-CN.json but missing in en.json:\n  ${extraInZh.join("\n  ")}`).toEqual([]);

    expect(enKeys.size).toBe(zhKeys.size);
  });
});
