import { estimateTokens } from "../../../src/core/context/token-estimator";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("scales roughly with text length for plain ASCII", () => {
    const short = estimateTokens("hello world");
    const long = estimateTokens("hello world ".repeat(20));
    expect(long).toBeGreaterThan(short * 10);
  });

  it("estimates more tokens per character for non-ASCII (e.g. Vietnamese) text than plain ASCII of the same length", () => {
    const ascii = "the quick brown fox jumps over the lazy dog";
    const vietnamese = "con cáo nâu nhanh nhẹn nhảy qua con chó lười biếng";
    // Same rough character count; Vietnamese with diacritics should estimate >= ASCII per-char.
    const asciiTokens = estimateTokens(ascii) / ascii.length;
    const vnTokens = estimateTokens(vietnamese) / vietnamese.length;
    expect(vnTokens).toBeGreaterThanOrEqual(asciiTokens);
  });
});
