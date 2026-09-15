import { skillRegistry } from "../../core/tools/skill-registry";
import { modelRouter } from "../../core/router/model-router";
import { textMessage } from "../../core/conversation/message-types";
import type { ProviderId } from "../../core/models/types";

export interface ImageAnalyzeInput {
  imageUrl: string;
  question: string;
  providerId: ProviderId;
  modelId: string;
}

/**
 * Vision analysis is just a chat request with an image part, routed
 * through the same ModelRouter every other chat goes through — no
 * separate vision infrastructure needed. The caller (agent loop / UI) is
 * responsible for confirming the target model supports vision first via
 * AIProvider#supportsVision — brief section 26/70: "If selected model does
 * not support vision... Do not silently pretend."
 */
async function analyzeImage(input: ImageAnalyzeInput) {
  const message = textMessage("user", input.question);
  message.parts.push({ type: "image", url: input.imageUrl });

  const { response } = await modelRouter.chat({
    primary: { providerId: input.providerId, modelId: input.modelId },
    request: { messages: [message] },
  });

  return { answer: response.message.parts.find((p) => p.type === "text")?.text ?? "" };
}

skillRegistry.register({
  name: "image-analyze",
  description: "Ask a vision-capable model a question about an image.",
  inputSchema: {
    type: "object",
    properties: {
      imageUrl: { type: "string" },
      question: { type: "string" },
      providerId: { type: "string" },
      modelId: { type: "string" },
    },
    required: ["imageUrl", "question", "providerId", "modelId"],
  },
  outputSchema: { type: "object" },
  permissions: ["NETWORK"],
  isAvailable: () => true,
  execute: analyzeImage,
});
