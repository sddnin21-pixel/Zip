import { normalizeXkiroModel } from "../../../src/providers/xkiro/normalize";
import type { XkiroModelEntry } from "../../../src/providers/xkiro/types";

describe("normalizeXkiroModel", () => {
  const baseEntry: XkiroModelEntry = {
    id: "anthropic/claude-sonnet-5",
    object: "model",
    display_name: "Claude Sonnet 5",
    owned_by: "anthropic",
    modality: "chat",
    access_tier: "paid",
    pricing: { currency: "USD", unit: "per_1m_tokens", input: 3, output: 15 },
    capabilities: { vision: true, tools: true, reasoning: false },
    context_length: 200_000,
    max_output_tokens: 8192,
  };

  it("maps id, provider, and display name verbatim from the live response — never a synthesized name", () => {
    const model = normalizeXkiroModel(baseEntry);
    expect(model.id).toBe("anthropic/claude-sonnet-5");
    expect(model.providerId).toBe("xkiro");
    expect(model.displayName).toBe("Claude Sonnet 5");
    expect(model.source).toBe("remote");
  });

  it("derives capabilities from the entry, not from a hard-coded table", () => {
    const model = normalizeXkiroModel(baseEntry);
    expect(model.capabilities.vision).toBe(true);
    expect(model.capabilities.toolCalling).toBe(true);
    expect(model.capabilities.reasoning).toBe(false);
    expect(model.capabilities.text).toBe(true);
  });

  it("marks image-modality entries with imageGeneration true and text false", () => {
    const imageEntry: XkiroModelEntry = { ...baseEntry, id: "xkiro/image-gen-1", modality: "image", capabilities: { vision: false, tools: false, reasoning: false } };
    const model = normalizeXkiroModel(imageEntry);
    expect(model.capabilities.imageGeneration).toBe(true);
    expect(model.capabilities.text).toBe(false);
    expect(model.modality).toBe("image");
  });

  it("carries through pricing and access tier without fabricating missing fields", () => {
    const model = normalizeXkiroModel(baseEntry);
    expect(model.pricing?.input).toBe(3);
    expect(model.pricing?.output).toBe(15);
    expect(model.accessTier).toBe("paid");
  });

  it("preserves min-plan gating info instead of hiding it", () => {
    const gated: XkiroModelEntry = { ...baseEntry, access_tier: "premium", min_plan_usd: 50, min_plan_names: ["Pro", "Team"] };
    const model = normalizeXkiroModel(gated);
    expect(model.minPlanUsd).toBe(50);
    expect(model.minPlanNames).toEqual(["Pro", "Team"]);
  });

  it("omits contextWindow/pricing rather than inventing defaults when absent", () => {
    const sparse: XkiroModelEntry = {
      id: "vendor/mystery-model",
      object: "model",
      display_name: "Mystery Model",
      owned_by: "vendor",
      modality: "chat",
      access_tier: "free",
      capabilities: { vision: false, tools: false, reasoning: false },
    };
    const model = normalizeXkiroModel(sparse);
    expect(model.contextWindow).toBeUndefined();
    expect(model.pricing).toBeUndefined();
  });
});
