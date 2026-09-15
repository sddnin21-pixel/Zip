import { skillRegistry } from "../../core/tools/skill-registry";

/**
 * Safe arithmetic expression evaluator. Deliberately does NOT use eval() or
 * new Function() — brief section 36: "no arbitrary code execution without
 * explicit controlled environment." This is a small recursive-descent
 * parser supporting + - * / % ^ (), unary minus, and a few Math functions.
 */

const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

class ExpressionParser {
  private pos = 0;
  constructor(private input: string) {}

  parse(): number {
    const result = this.parseExpression();
    this.skipWhitespace();
    if (this.pos < this.input.length) {
      throw new Error(`Unexpected character at position ${this.pos}: "${this.input[this.pos]}"`);
    }
    return result;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      this.skipWhitespace();
      const op = this.input[this.pos];
      if (op === "+" || op === "-") {
        this.pos++;
        const rhs = this.parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      } else break;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parsePower();
    for (;;) {
      this.skipWhitespace();
      const op = this.input[this.pos];
      if (op === "*" || op === "/" || op === "%") {
        this.pos++;
        const rhs = this.parsePower();
        if (op === "*") value *= rhs;
        else if (op === "/") {
          if (rhs === 0) throw new Error("Division by zero");
          value /= rhs;
        } else value %= rhs;
      } else break;
    }
    return value;
  }

  private parsePower(): number {
    const base = this.parseUnary();
    this.skipWhitespace();
    if (this.input[this.pos] === "^") {
      this.pos++;
      const exponent = this.parsePower(); // right-associative
      return Math.pow(base, exponent);
    }
    return base;
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.input[this.pos] === "-") {
      this.pos++;
      return -this.parseUnary();
    }
    if (this.input[this.pos] === "+") {
      this.pos++;
      return this.parseUnary();
    }
    return this.parseAtom();
  }

  private parseAtom(): number {
    this.skipWhitespace();
    if (this.input[this.pos] === "(") {
      this.pos++;
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.input[this.pos] !== ")") throw new Error("Expected closing parenthesis");
      this.pos++;
      return value;
    }

    const funcMatch = /^[a-zA-Z]+/.exec(this.input.slice(this.pos));
    if (funcMatch) {
      const name = funcMatch[0];
      const fn = ALLOWED_FUNCTIONS[name];
      if (!fn) throw new Error(`Unknown function or constant: "${name}"`);
      this.pos += name.length;
      this.skipWhitespace();
      if (this.input[this.pos] !== "(") throw new Error(`Expected "(" after function "${name}"`);
      this.pos++;
      const args: number[] = [this.parseExpression()];
      this.skipWhitespace();
      while (this.input[this.pos] === ",") {
        this.pos++;
        args.push(this.parseExpression());
        this.skipWhitespace();
      }
      if (this.input[this.pos] !== ")") throw new Error(`Expected ")" to close call to "${name}"`);
      this.pos++;
      return fn(...args);
    }

    const numMatch = /^\d+(\.\d+)?/.exec(this.input.slice(this.pos));
    if (!numMatch) throw new Error(`Expected a number at position ${this.pos}`);
    this.pos += numMatch[0].length;
    return Number(numMatch[0]);
  }

  private skipWhitespace(): void {
    while (this.input[this.pos] === " " || this.input[this.pos] === "\t") this.pos++;
  }
}

export function evaluateExpression(expression: string): number {
  return new ExpressionParser(expression).parse();
}

skillRegistry.register({
  name: "calculator",
  description: "Evaluate a mathematical expression (supports + - * / % ^, parentheses, and sqrt/abs/floor/ceil/round/sin/cos/tan/log/min/max/pow).",
  inputSchema: {
    type: "object",
    properties: { expression: { type: "string" } },
    required: ["expression"],
  },
  outputSchema: { type: "object", properties: { result: { type: "number" } } },
  permissions: ["READ"],
  isAvailable: () => true,
  execute: async (input: { expression: string }) => ({ result: evaluateExpression(input.expression) }),
});
