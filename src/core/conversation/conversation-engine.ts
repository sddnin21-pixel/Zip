import * as Crypto from "expo-crypto";
import type { Conversation, ModelSwitchEvent } from "./conversation-types";
import type { QusinMessage } from "./message-types";
import { textMessage } from "./message-types";
import { conversationStore } from "./conversation-store";
import { contextManager } from "../context/context-manager";
import { modelRouter, type RouteTarget } from "../router/model-router";
import type { AIModel, ProviderId } from "../models/types";
import type { StreamChunk } from "../../providers/shared/provider-interface";
import { modelCatalogCache } from "../models/catalog-cache";

export interface SendMessageOptions {
  conversation: Conversation;
  userText: string;
  target: RouteTarget;
  fallbacks?: RouteTarget[];
  keyStrategy?: { type: "manual" | "round_robin" | "failover" | "smart"; manualKeyId?: string };
  onSwitchNotice?: (notice: { fromModel?: string; toModel: string; reason: string }) => void;
}

/**
 * Orchestrates a single turn: pack context for the *target* model, stream
 * the response through the ModelRouter, persist both the user message and
 * the assistant response, and record a ModelSwitchEvent whenever the
 * effective provider/model differs from the last message's (brief section
 * 16 — "the new model receives the appropriate context... Store model
 * history").
 */
class ConversationEngine {
  async *sendMessage(opts: SendMessageOptions): AsyncGenerator<StreamChunk, QusinMessage, unknown> {
    const { conversation, target } = opts;

    const userMessage = textMessage("user", opts.userText);
    const userSeq = conversation.messages.length;
    conversation.messages.push(userMessage);
    await conversationStore.appendMessage(conversation.id, userMessage, userSeq);

    await this.maybeRecordSwitch(conversation, target, userSeq + 1, opts.onSwitchNotice);

    const targetModel = await this.resolveModel(target);
    const packed = await contextManager.pack(conversation, targetModel, opts.userText);

    const requestMessages = packed.systemPrompt
      ? [textMessage("system", packed.systemPrompt), ...packed.messages]
      : packed.messages;

    let assistantText = "";
    let finalUsage: QusinMessage["usage"] | undefined;
    let finalFinishReason: QusinMessage["finishReason"];
    let effectiveProvider: ProviderId = target.providerId;
    let effectiveModel = target.modelId;

    const stream = modelRouter.streamChat({
      primary: target,
      fallbacks: opts.fallbacks,
      keyStrategy: opts.keyStrategy,
      request: { messages: requestMessages },
    });

    for await (const chunk of stream) {
      if (chunk.route.switchedFrom && opts.onSwitchNotice) {
        opts.onSwitchNotice({
          fromModel: chunk.route.switchedFrom.modelId,
          toModel: chunk.route.usedModel,
          reason: chunk.route.switchReason ?? "error",
        });
      }
      effectiveProvider = chunk.route.usedProvider;
      effectiveModel = chunk.route.usedModel;
      if (chunk.textDelta) assistantText += chunk.textDelta;
      if (chunk.usage) finalUsage = chunk.usage;
      if (chunk.finishReason) finalFinishReason = chunk.finishReason;
      yield chunk;
    }

    const assistantMessage: QusinMessage = {
      id: Crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: assistantText }],
      provider: effectiveProvider,
      model: effectiveModel,
      timestamp: Date.now(),
      usage: finalUsage,
      finishReason: finalFinishReason,
    };
    conversation.messages.push(assistantMessage);
    await conversationStore.appendMessage(conversation.id, assistantMessage, userSeq + 1);

    if (contextManager.needsSummaryUpdate(conversation)) {
      // Summary generation itself is a follow-up call through the same
      // router/model — left to the agent/summarization skill so the engine
      // stays a thin orchestrator (brief section 75, one responsibility per module).
    }

    return assistantMessage;
  }

  /** Explicit model switch with no new user message yet — just updates the conversation's default target and records the switch event for history/UI (brief section 16 diagram: "Model switched: A -> B"). */
  async switchModel(conversation: Conversation, target: RouteTarget, reason: ModelSwitchEvent["reason"] = "user_choice"): Promise<void> {
    await this.maybeRecordSwitch(conversation, target, conversation.messages.length, undefined, reason);
    conversation.settings.defaultProviderId = target.providerId;
    conversation.settings.defaultModelId = target.modelId;
    await conversationStore.updateSettings(conversation.id, conversation.settings);
  }

  private async maybeRecordSwitch(
    conversation: Conversation,
    target: RouteTarget,
    atMessageIndex: number,
    onSwitchNotice?: SendMessageOptions["onSwitchNotice"],
    reason: ModelSwitchEvent["reason"] = "user_choice"
  ): Promise<void> {
    const last = conversation.modelHistory[conversation.modelHistory.length - 1];
    const lastProvider = last?.toProvider ?? conversation.settings.defaultProviderId;
    const lastModel = last?.toModel ?? conversation.settings.defaultModelId;

    if (lastProvider === target.providerId && lastModel === target.modelId) return;

    const event: ModelSwitchEvent = {
      id: Crypto.randomUUID(),
      fromProvider: lastProvider,
      fromModel: lastModel,
      toProvider: target.providerId,
      toModel: target.modelId,
      atMessageIndex,
      reason,
      timestamp: Date.now(),
    };
    conversation.modelHistory.push(event);
    await conversationStore.recordModelSwitch(conversation.id, event);
    onSwitchNotice?.({ fromModel: lastModel, toModel: target.modelId, reason });
  }

  private async resolveModel(target: RouteTarget): Promise<AIModel> {
    const cached = await modelCatalogCache.get(target.providerId);
    const found = cached?.models.find((m) => m.id === target.modelId);
    if (found) return found;
    // Fall back to a minimal AIModel shape so context packing still works
    // with a conservative default context window rather than throwing.
    return {
      id: target.modelId,
      providerId: target.providerId,
      displayName: target.modelId,
      modality: "chat",
      capabilities: {
        text: true,
        vision: false,
        audioInput: false,
        audioOutput: false,
        imageGeneration: false,
        videoGeneration: false,
        toolCalling: false,
        structuredOutput: false,
        reasoning: false,
        embeddings: false,
        streaming: true,
      },
      source: target.providerId === "local" ? "local" : "remote",
      status: "available",
      lastUpdated: Date.now(),
    };
  }
}

export const conversationEngine = new ConversationEngine();
