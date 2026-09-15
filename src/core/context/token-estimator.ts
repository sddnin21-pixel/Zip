/**
 * Rough token estimator. We do not bundle a real tokenizer per-model (that
 * would require shipping a BPE vocab per provider/model, which the brief
 * doesn't ask for and would bloat the app) — this is the same "~4 chars per
 * token" heuristic most client-side tools use for context-packing
 * decisions. It is deliberately conservative (slightly overestimates) so
 * context packing errs toward leaving headroom rather than overflowing.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // CJK/Vietnamese diacritics tend toward more tokens per character than
  // plain ASCII; nudge the divisor down when the text has a meaningful
  // proportion of multi-byte characters.
  const nonAsciiRatio = [...text].filter((c) => c.codePointAt(0)! > 127).length / text.length;
  const charsPerToken = nonAsciiRatio > 0.3 ? 2.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}
