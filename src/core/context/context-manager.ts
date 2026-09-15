import type { Conversation } from "../conversation/conversation-types";
import type { QusinMessage } from "../conversation/message-types";
import { messageToPlainText } from "../conversation/message-types";
import { estimateTokens } from "./token-estimator";
import { memoryStore } from "../memory/memory-store";
import type { AIModel } from "../models/types";

export interface PackedContext {
  systemPrompt?: string;
  messages: QusinMessage[];
  /** True if older messages had to be summarized/dropped to fit. */
  truncated: boolean;
  estimatedTokens: number;
}

const DEFAULT_CONTEXT_WINDOW = 8192; // conservative floor when a model doesn't report contextWindow
const OUTPUT_RESERVE_RATIO = 0.25; // reserve room for the model's response

/**
 * Central context-packing logic (brief section 17). Never blindly sends the
 * whole transcript — always: recent messages, then (if they don't fit)
 * older-but-relevant messages, then the conversation summary, then relevant
 * memory, all bounded to the *target* model's actual context window, which
 * varies every time the user switches models (brief section 16).
 */
class ContextManager {
  async pack(conversation: Conversation, targetModel: AIModel, userQuery: string): Promise<PackedContext> {
    const contextWindow = targetModel.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    const budget = Math.floor(contextWindow * (1 - OUTPUT_RESERVE_RATIO));

    const systemPrompt = await this.buildSystemPrompt(conversation, userQuery);
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;

    // Reserve room for the summary UP FRONT when the full transcript can't
    // possibly fit — otherwise the most-recent message(s) could consume the
    // entire remaining budget and starve out the summary that carries
    // earlier identity/context info (the actual failure mode brief section
    // 65's scenario is testing for). We only reserve when it's actually
    // needed: compute an optimistic pass first to see if everything fits.
    const wouldFitWithoutSummary = this.estimateFullTranscriptTokens(conversation.messages) <= budget - systemTokens;
    const summaryReserve =
      !wouldFitWithoutSummary && conversation.summary ? estimateTokens(conversation.summary) : 0;

    let remaining = budget - systemTokens - summaryReserve;

    // Walk messages newest-first, keep everything that fits.
    const kept: QusinMessage[] = [];
    let truncated = false;
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const msg = conversation.messages[i]!;
      const msgTokens = estimateTokens(messageToPlainText(msg)) + 8; // small per-message overhead
      if (msgTokens > remaining) {
        // Doesn't fit — everything older than this point gets summarized
        // instead of included verbatim.
        truncated = i > 0;
        break;
      }
      kept.unshift(msg);
      remaining -= msgTokens;
    }

    // If we truncated and the conversation has a rolling summary, prepend
    // it as a synthetic system-ish message so the model has continuity
    // without the full transcript (brief section 17: "conversation summarization").
    if (truncated && conversation.summary) {
      const summaryTokens = estimateTokens(conversation.summary);
      if (summaryTokens <= summaryReserve + remaining) {
        kept.unshift({
          id: `summary-${conversation.id}`,
          role: "system",
          parts: [{ type: "text", text: `Earlier conversation summary:\n${conversation.summary}` }],
          timestamp: conversation.messages[0]?.timestamp ?? Date.now(),
        });
      }
    }

    return {
      systemPrompt,
      messages: kept,
      truncated,
      estimatedTokens: budget - remaining - summaryReserve + systemTokens,
    };
  }

  /** Cheap upper-bound check: does the whole transcript fit without needing to reserve summary budget at all? Avoids penalizing the common case (short conversations) with an unnecessary reservation. */
  private estimateFullTranscriptTokens(messages: QusinMessage[]): number {
    return messages.reduce((sum, m) => sum + estimateTokens(messageToPlainText(m)) + 8, 0);
  }

  private async buildSystemPrompt(conversation: Conversation, userQuery: string): Promise<string | undefined> {
    const parts: string[] = [];
    if (conversation.settings.systemPrompt) {
      parts.push(conversation.settings.systemPrompt);
    }

    if (conversation.settings.memoryEnabled) {
      const relevant = await memoryStore.search(userQuery, 6);
      const scoped = (await memoryStore.list("conversation", conversation.id)).slice(0, 4);
      const merged = dedupeById([...relevant, ...scoped]);
      if (merged.length > 0) {
        parts.push(
          "Relevant memory (retrieved by Qusin AI, not from the model's own memory):\n" +
            merged.map((m) => `- ${m.content}`).join("\n")
        );
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  /**
   * Whether a conversation needs a fresh/updated rolling summary — called
   * after each assistant turn so long conversations stay switchable
   * between models with very different context windows (e.g. a 4K-context
   * local model following a 200K-context remote one).
   */
  needsSummaryUpdate(conversation: Conversation): boolean {
    const lastSummarized = conversation.summaryUpToMessageIndex ?? 0;
    return conversation.messages.length - lastSummarized >= 20;
  }
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

export const contextManager = new ContextManager();
