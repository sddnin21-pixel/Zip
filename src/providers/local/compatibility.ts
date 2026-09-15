import type { GGUFQuantizationVariant, LocalModelCompatibility } from "./types";

/**
 * Rough RAM estimate for a GGUF file: llama.cpp needs roughly the file size
 * itself plus context-window KV-cache overhead. We use file size * 1.2 as a
 * conservative floor — this is an estimate shown to the user as guidance,
 * never presented as an exact guarantee (brief section 9: "Display ...
 * RAM requirement").
 */
function estimateRamBytes(fileSizeBytes: number): number {
  return Math.round(fileSizeBytes * 1.2);
}

/**
 * Device total RAM isn't reliably queryable cross-platform from JS in Expo
 * managed workflow without an extra native module we haven't added, so we
 * use a configurable conservative floor and let the user's own judgement
 * (shown alongside the estimated requirement) make the final call — we
 * refuse to claim a hard yes/no we can't actually verify on-device.
 */
const ASSUMED_MIN_DEVICE_RAM_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB — safe floor for low-end Android

export function checkGGUFCompatibility(variant: GGUFQuantizationVariant): LocalModelCompatibility {
  if (!variant.fileName.toLowerCase().endsWith(".gguf")) {
    return {
      compatible: false,
      runtime: "unsupported",
      reason: "Not a GGUF file — Qusin AI's on-device runtime (llama.rn) only loads GGUF-quantized models.",
    };
  }

  if (!variant.sizeBytes) {
    return {
      compatible: true,
      runtime: "llama-rn-gguf",
      reason: "File size unknown — compatibility could not be fully verified before download.",
    };
  }

  const estimatedRam = estimateRamBytes(variant.sizeBytes);
  if (estimatedRam > ASSUMED_MIN_DEVICE_RAM_BYTES * 4) {
    // Roughly: models needing >12GB RAM estimate are flagged as likely
    // incompatible with typical mobile hardware, not hidden.
    return {
      compatible: false,
      runtime: "unsupported",
      reason: `Estimated RAM requirement (~${(estimatedRam / 1e9).toFixed(1)} GB) is too high for typical mobile hardware.`,
      estimatedRamBytes: estimatedRam,
    };
  }

  return {
    compatible: true,
    runtime: "llama-rn-gguf",
    estimatedRamBytes: estimatedRam,
  };
}
