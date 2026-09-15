import { SkillRegistry } from "../../../src/core/tools/skill-registry";

function registerDummySkills(registry: SkillRegistry) {
  registry.register({
    name: "dummy-read",
    description: "test read skill",
    inputSchema: {},
    outputSchema: {},
    permissions: ["READ"],
    isAvailable: () => true,
    execute: async () => ({ ok: true }),
  });
  registry.register({
    name: "dummy-write",
    description: "test write skill",
    inputSchema: {},
    outputSchema: {},
    permissions: ["WRITE"],
    isAvailable: () => true,
    execute: async () => ({ ok: true }),
  });
}

describe("SkillRegistry", () => {
  it("does not gate READ-only skills behind confirmation", async () => {
    const registry = new SkillRegistry();
    registerDummySkills(registry);
    const result = await registry.execute("dummy-read", {});
    expect(result.requiresConfirmation).toBe(false);
    expect(result.output).toEqual({ ok: true });
  });

  it("gates WRITE-permission skills behind confirmation and withholds output until confirmed", async () => {
    const registry = new SkillRegistry();
    registerDummySkills(registry);

    const unconfirmed = await registry.execute("dummy-write", {});
    expect(unconfirmed.requiresConfirmation).toBe(true);
    expect(unconfirmed.confirmed).toBe(false);
    expect(unconfirmed.output).toBeUndefined();

    const confirmed = await registry.execute("dummy-write", {}, { confirmed: true });
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.output).toEqual({ ok: true });
  });

  it("reports NOT IMPLEMENTED for an unregistered skill rather than throwing", async () => {
    const registry = new SkillRegistry();
    const result = await registry.execute("does-not-exist", {});
    expect(result.error).toMatch(/NOT IMPLEMENTED/);
  });

  it("reports REQUIRES CONFIGURATION when a skill's isAvailable() returns false", async () => {
    const registry = new SkillRegistry();
    registry.register({
      name: "needs-config",
      description: "test",
      inputSchema: {},
      outputSchema: {},
      permissions: ["NETWORK"],
      isAvailable: () => false,
      execute: async () => ({ ok: true }),
    });
    const result = await registry.execute("needs-config", {});
    expect(result.error).toMatch(/REQUIRES CONFIGURATION/);
  });

  it("rejects invalid (non-object) tool arguments before execution", async () => {
    const registry = new SkillRegistry();
    registerDummySkills(registry);
    const result = await registry.execute("dummy-read", "not an object" as unknown);
    expect(result.error).toMatch(/Invalid arguments/);
  });

  it("refuses to register the same skill name twice", () => {
    const registry = new SkillRegistry();
    registerDummySkills(registry);
    expect(() =>
      registry.register({
        name: "dummy-read",
        description: "duplicate",
        inputSchema: {},
        outputSchema: {},
        permissions: ["READ"],
        isAvailable: () => true,
        execute: async () => ({}),
      })
    ).toThrow(/already registered/);
  });

  it("produces tool definitions suitable for a model's function-calling schema", () => {
    const registry = new SkillRegistry();
    registerDummySkills(registry);
    const defs = registry.toToolDefinitions();
    expect(defs).toContainEqual(
      expect.objectContaining({ name: "dummy-read", description: expect.any(String), parameters: {} })
    );
  });
});
