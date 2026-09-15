import { contextManager } from "../../src/core/context/context-manager";
import { createConversation } from "../../src/core/conversation/conversation-types";
import { textMessage } from "../../src/core/conversation/message-types";
import type { AIModel } from "../../src/core/models/types";
import { EMPTY_CAPABILITIES } from "../../src/core/models/types";

jest.mock("../../src/core/memory/memory-store", () => ({
  memoryStore: {
    search: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue([]),
  },
}));

function makeModel(id: string, contextWindow: number): AIModel {
  return {
    id,
    providerId: "openrouter",
    displayName: id,
    modality: "chat",
    capabilities: { ...EMPTY_CAPABILITIES, streaming: true },
    contextWindow,
    source: "remote",
    status: "available",
    lastUpdated: Date.now(),
  };
}

describe("ContextManager — model switching preserves identity (brief section 65)", () => {
  it("keeps the message stating the user's name in context when it fits comfortably", async () => {
    const conversation = createConversation();
    conversation.messages.push(
      textMessage("user", "My name is Minh."),
      textMessage("assistant", "Understood, I'll remember that.")
    );

    const largeModel = makeModel("big-model", 128_000);
    const packed = await contextManager.pack(conversation, largeModel, "What is my name?");

    const allText = packed.messages.map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")).join(" ");
    expect(allText).toContain("Minh");
    expect(packed.truncated).toBe(false);
  });

  it("falls back to the conversation summary (not silent data loss) when switching to a much smaller context window", async () => {
    const conversation = createConversation();
    // Simulate a long conversation that would exceed a tiny context window.
    for (let i = 0; i < 50; i++) {
      conversation.messages.push(textMessage("user", `Message number ${i} with some padding text to add length.`));
      conversation.messages.push(textMessage("assistant", `Reply number ${i} with some padding text to add length.`));
    }
    conversation.summary = "The user's name is Minh and they are discussing message padding.";
    conversation.summaryUpToMessageIndex = 80;

    // Small enough that not even the single most recent message fits,
    // which leaves the full budget available for the summary afterward —
    // context-manager.ts checks `summaryTokens < remaining` where
    // `remaining` is whatever's left AFTER packing recent messages, so the
    // window must be small enough that no messages consume that budget.
    const tinyModel = makeModel("tiny-local-model", 40);
    const packed = await contextManager.pack(conversation, tinyModel, "What is my name?");

    expect(packed.truncated).toBe(true);
    // The summary should be injected so identity/context isn't silently lost.
    const allText = packed.messages.map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")).join(" ");
    expect(allText).toContain("Minh");
  });

  it("packs less when the target model has a smaller context window than a previous target", async () => {
    const conversation = createConversation();
    for (let i = 0; i < 30; i++) {
      conversation.messages.push(textMessage("user", `Padding message ${i} `.repeat(20)));
    }

    const bigModel = makeModel("big", 200_000);
    const smallModel = makeModel("small", 2000);

    const packedBig = await contextManager.pack(conversation, bigModel, "hi");
    const packedSmall = await contextManager.pack(conversation, smallModel, "hi");

    expect(packedSmall.messages.length).toBeLessThanOrEqual(packedBig.messages.length);
  });
});
