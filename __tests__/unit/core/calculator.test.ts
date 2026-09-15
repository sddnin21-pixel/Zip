import { evaluateExpression } from "../../../src/skills/code/calculator-skill";

describe("evaluateExpression", () => {
  it("evaluates basic arithmetic with correct precedence", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("10 / 2 - 1")).toBe(4);
  });

  it("handles exponentiation right-associatively", () => {
    expect(evaluateExpression("2 ^ 3 ^ 2")).toBe(512); // 2^(3^2), not (2^3)^2
  });

  it("handles unary minus", () => {
    expect(evaluateExpression("-5 + 3")).toBe(-2);
    expect(evaluateExpression("3 - -2")).toBe(5);
  });

  it("supports allowed math functions", () => {
    expect(evaluateExpression("sqrt(16)")).toBe(4);
    expect(evaluateExpression("max(3, 7, 2)")).toBe(7);
    expect(evaluateExpression("abs(-9)")).toBe(9);
  });

  it("throws on division by zero rather than returning Infinity silently", () => {
    expect(() => evaluateExpression("1 / 0")).toThrow(/zero/);
  });

  it("throws on unknown functions/identifiers instead of evaluating them as globals", () => {
    expect(() => evaluateExpression("require(1)")).toThrow(/Unknown function/);
  });

  it("throws on malformed expressions", () => {
    expect(() => evaluateExpression("2 + )")).toThrow();
    expect(() => evaluateExpression("2 +")).toThrow();
  });

  it("respects modulo", () => {
    expect(evaluateExpression("10 % 3")).toBe(1);
  });
});
