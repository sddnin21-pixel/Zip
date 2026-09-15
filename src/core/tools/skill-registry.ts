import { DANGEROUS_PERMISSIONS, type SkillDefinition, type SkillExecutionResult } from "./skill-types";
import { normalizedError } from "../../providers/shared/errors";
import { validateToolArguments } from "../../security/input-validation";

/** Exported for tests, which need isolated instances rather than the shared app-wide singleton below. Application code should use `skillRegistry`, not construct this directly. */
export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  register<TInput, TOutput>(skill: SkillDefinition<TInput, TOutput>): void {
    if (this.skills.has(skill.name)) {
      throw new Error(
        `Skill "${skill.name}" is already registered — Qusin AI keeps exactly one authoritative implementation per skill (brief section 75).`
      );
    }
    this.skills.set(skill.name, skill as unknown as SkillDefinition);
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  /** For passing to a tool-calling-capable model as its available function list. */
  toToolDefinitions(): { name: string; description: string; parameters: Record<string, unknown> }[] {
    return this.list().map((s) => ({
      name: s.name,
      description: s.description,
      parameters: s.inputSchema,
    }));
  }

  requiresConfirmation(skillName: string): boolean {
    const skill = this.skills.get(skillName);
    if (!skill) return true;
    return skill.permissions.some((p) => DANGEROUS_PERMISSIONS.has(p));
  }

  async execute(
    skillName: string,
    input: unknown,
    opts: { confirmed?: boolean } = {}
  ): Promise<SkillExecutionResult> {
    const startedAt = Date.now();
    const skill = this.skills.get(skillName);

    if (!skill) {
      return {
        skillName,
        input,
        error: `NOT IMPLEMENTED: no skill named "${skillName}" is registered.`,
        requiresConfirmation: false,
        confirmed: false,
        startedAt,
        completedAt: Date.now(),
      };
    }

    const argCheck = validateToolArguments(input);
    if (!argCheck.valid) {
      return {
        skillName,
        input,
        error: `Invalid arguments: ${argCheck.reason}`,
        requiresConfirmation: false,
        confirmed: false,
        startedAt,
        completedAt: Date.now(),
      };
    }

    const needsConfirmation = this.requiresConfirmation(skillName);
    if (needsConfirmation && !opts.confirmed) {
      return {
        skillName,
        input,
        error: undefined,
        requiresConfirmation: true,
        confirmed: false,
        startedAt,
      };
    }

    const available = await skill.isAvailable();
    if (!available) {
      return {
        skillName,
        input,
        error: `REQUIRES CONFIGURATION: "${skillName}" is not currently configured/available.`,
        requiresConfirmation: needsConfirmation,
        confirmed: opts.confirmed ?? false,
        startedAt,
        completedAt: Date.now(),
      };
    }

    try {
      const output = await skill.execute(input);
      return {
        skillName,
        input,
        output,
        requiresConfirmation: needsConfirmation,
        confirmed: opts.confirmed ?? false,
        startedAt,
        completedAt: Date.now(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        skillName,
        input,
        error: message,
        requiresConfirmation: needsConfirmation,
        confirmed: opts.confirmed ?? false,
        startedAt,
        completedAt: Date.now(),
      };
    }
  }

  errorForMissingSkill(name: string) {
    return normalizedError("UNSUPPORTED_CAPABILITY", `NOT IMPLEMENTED: skill "${name}" is not registered.`);
  }
}

export const skillRegistry = new SkillRegistry();
