import { checkGGUFCompatibility } from "../../../src/providers/local/compatibility";
import type { GGUFQuantizationVariant } from "../../../src/providers/local/types";

describe("checkGGUFCompatibility", () => {
  it("accepts a reasonably-sized GGUF file", () => {
    const variant: GGUFQuantizationVariant = {
      fileName: "model.Q4_K_M.gguf",
      quantization: "Q4_K_M",
      sizeBytes: 4 * 1024 * 1024 * 1024, // 4GB
      downloadUrl: "https://huggingface.co/org/repo/resolve/main/model.Q4_K_M.gguf",
    };
    const result = checkGGUFCompatibility(variant);
    expect(result.compatible).toBe(true);
    expect(result.runtime).toBe("llama-rn-gguf");
  });

  it("rejects a non-GGUF file with a clear reason", () => {
    const variant: GGUFQuantizationVariant = {
      fileName: "model.safetensors",
      quantization: "unknown",
      downloadUrl: "https://huggingface.co/org/repo/resolve/main/model.safetensors",
    };
    const result = checkGGUFCompatibility(variant);
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/GGUF/);
  });

  it("flags an oversized model as incompatible with a RAM-related reason, not silently allowed", () => {
    const variant: GGUFQuantizationVariant = {
      fileName: "huge-model.F16.gguf",
      quantization: "F16",
      sizeBytes: 80 * 1024 * 1024 * 1024, // 80GB — way beyond mobile RAM
      downloadUrl: "https://huggingface.co/org/repo/resolve/main/huge-model.F16.gguf",
    };
    const result = checkGGUFCompatibility(variant);
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/RAM/);
  });

  it("still returns compatible=true (not a fabricated false) when size is unknown, but says so", () => {
    const variant: GGUFQuantizationVariant = {
      fileName: "model.Q4_K_M.gguf",
      quantization: "Q4_K_M",
      downloadUrl: "https://huggingface.co/org/repo/resolve/main/model.Q4_K_M.gguf",
    };
    const result = checkGGUFCompatibility(variant);
    expect(result.compatible).toBe(true);
    expect(result.reason).toMatch(/unknown/i);
  });
});
