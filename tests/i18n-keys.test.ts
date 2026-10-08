import { describe, expect, it } from "vitest";
import { enModules, ptModules } from "../src/i18n";

describe("i18n", () => {
  it("every pt-BR key exists in en, per module", () => {
    for (const [mod, pt] of Object.entries(ptModules)) {
      const en = enModules[mod as keyof typeof enModules];
      const missing = Object.keys(pt).filter((k) => !en[k]);
      expect(missing, `missing in en/${mod}`).toEqual([]);
    }
  });
  it("pt-BR values are identical to the original Portuguese text", () => {
    for (const pt of Object.values(ptModules)) for (const [k, v] of Object.entries(pt)) expect(v).toBe(k);
  });
});
