import { normalizeOpenRouterModel } from "../../../src/providers/openrouter/normalize";
import type { OpenRouterModelEntry } from "../../../src/providers/openrouter/types";

describe("normalizeOpenRouterModel", () => {
  const baseEntry: OpenRouterModelEntry = {
    id: "openai/gpt-5.6",
    name: "GPT-5.6",
    context_length: 128_000,
    architecture: { modality: "text->text", input_modalities: ["text"], output_modalities: ["text"] },
    pricing: { prompt: "0.000003", completion: "0.000015" },
    top_provider: { context_length: 128_000, max_completion_tokens: 16_384 },
    supported_parameters: ["tools", "response_format", "reasoning"],
  };

  it("converts per-token USD pricing strings to per-1M-token numbers", () => {
    const model = normalizeOpenRouterModel(baseEntry);
    expect(model.pricing?.input).toBeCloseTo(3, 5);
    expect(model.pricing?.output).toBeCloseTo(15, 5);
    expect(model.pricing?.unit).toBe("per_1m_tokens");
  });

  it("derives vision from input_modalities rather than a hard-coded list", () => {
    const visionEntry: OpenRouterModelEntry = {
      ...baseEntry,
      id: "openai/gpt-5.6-vision",
      architecture: { ...baseEntry.architecture, input_modalities: ["text", "image"] },
    };
    expect(normalizeOpenRouterModel(visionEntry).capabilities.vision).toBe(true);
    expect(normalizeOpenRouterModel(baseEntry).capabilities.vision).toBe(false);
  });

  it("derives tool/reasoning/structured-output support from supported_parameters", () => {
    const model = normalizeOpenRouterModel(baseEntry);
    expect(model.capabilities.toolCalling).toBe(true);
    expect(model.capabilities.reasoning).toBe(true);
    expect(model.capabilities.structuredOutput).toBe(true);
  });

  it("reports no tool/reasoning support when absent from supported_parameters", () => {
    const plain: OpenRouterModelEntry = { ...baseEntry, id: "vendor/plain-model", supported_parameters: [] };
    const model = normalizeOpenRouterModel(plain);
    expect(model.capabilities.toolCalling).toBe(false);
    expect(model.capabilities.reasoning).toBe(false);
  });

  it("prefers top_provider.context_length over the top-level context_length when both are present", () => {
    const model = normalizeOpenRouterModel(baseEntry);
    expect(model.contextWindow).toBe(128_000);
  });

  it("handles missing pricing without throwing or fabricating numbers", () => {
    const noPricing: OpenRouterModelEntry = { ...baseEntry, pricing: undefined };
    const model = normalizeOpenRouterModel(noPricing);
    expect(model.pricing).toBeUndefined();
  });
});
