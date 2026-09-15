import { skillRegistry } from "../../core/tools/skill-registry";
import { memoryStore, type MemoryType } from "../../core/memory/memory-store";

skillRegistry.register({
  name: "memory-search",
  description: "Search Qusin AI's stored memory for entries relevant to a query.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "number" } },
    required: ["query"],
  },
  outputSchema: { type: "object" },
  permissions: ["READ"],
  isAvailable: () => true,
  execute: async (input: { query: string; limit?: number }) => {
    const results = await memoryStore.search(input.query, input.limit ?? 10);
    return { results };
  },
});

skillRegistry.register({
  name: "memory-save",
  description: "Save a new piece of information to memory, scoped to the current conversation, project, or the user globally.",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["short_term", "conversation", "user", "project", "file", "task"] },
      content: { type: "string" },
      scopeId: { type: "string" },
    },
    required: ["type", "content"],
  },
  outputSchema: { type: "object" },
  permissions: ["WRITE"],
  isAvailable: () => true,
  execute: async (input: { type: MemoryType; content: string; scopeId?: string }) => {
    const entry = await memoryStore.add(input.type, input.content, input.scopeId);
    return { id: entry.id };
  },
});

skillRegistry.register({
  name: "memory-update",
  description: "Update the content of an existing memory entry by ID.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" }, content: { type: "string" } },
    required: ["id", "content"],
  },
  outputSchema: { type: "object" },
  permissions: ["WRITE"],
  isAvailable: () => true,
  execute: async (input: { id: string; content: string }) => {
    await memoryStore.update(input.id, input.content);
    return { updated: true };
  },
});
