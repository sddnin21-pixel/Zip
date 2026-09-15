export type PermissionLevel = "READ" | "WRITE" | "NETWORK" | "EXECUTE" | "SYSTEM";

/** Whether a given permission level requires explicit user confirmation before running (brief section 37 — "Dangerous tools require confirmation"). */
export const DANGEROUS_PERMISSIONS: ReadonlySet<PermissionLevel> = new Set(["EXECUTE", "SYSTEM", "WRITE"]);

export interface SkillDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** JSON schema for the input — also what gets sent to a tool-calling-capable model as its function definition. */
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissions: PermissionLevel[];
  /** False when the skill needs external config (e.g. a search backend URL) that hasn't been set up — surfaced as "REQUIRES CONFIGURATION" per brief section 72, never silently pretended to work. */
  isAvailable: () => Promise<boolean> | boolean;
  execute: (input: TInput) => Promise<TOutput>;
}

export interface SkillExecutionResult<TOutput = unknown> {
  skillName: string;
  input: unknown;
  output?: TOutput;
  error?: string;
  requiresConfirmation: boolean;
  confirmed: boolean;
  startedAt: number;
  completedAt?: number;
}
