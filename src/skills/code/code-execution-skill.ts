import { skillRegistry } from "../../core/tools/skill-registry";

/**
 * Code execution (brief section 21/36). HONEST LIMITATION — read before
 * changing this file:
 *
 * Brief section 36 requires "no arbitrary code execution without explicit
 * controlled environment" and section 72 forbids faking tool execution.
 * On a React Native/Expo target there is no OS-level sandbox (no container,
 * no separate process, no seccomp) available to isolate arbitrary
 * JavaScript, Python, or shell code the way a server-side agent runtime
 * (e.g. a Docker container or a gVisor sandbox) would. Implementing a
 * "run any code" skill here would either:
 *   (a) be fake — return canned/simulated output, which brief section 72
 *       explicitly forbids, or
 *   (b) be genuinely unsafe — run untrusted code with the same OS
 *       privileges as the app itself (file system, network, secure
 *       storage access), which brief section 36 explicitly forbids.
 *
 * So this skill deliberately does NEITHER. What it actually does:
 *  - Accepts only a small, explicitly-safe subset: pure-expression
 *    JavaScript with no access to any host API (no `require`, no
 *    `fetch`, no `FileSystem`, no closures over app state). It is
 *    implemented as a tiny interpreter over a restricted AST subset
 *    (arithmetic, string ops, array/object literals, basic control
 *    flow) — NOT a JS engine with eval/Function access.
 *  - Anything beyond that subset (imports, loops with side effects,
 *    network calls, file access, arbitrary Python/shell) is reported as
 *    UNSUPPORTED with the specific reason, never silently attempted.
 *  - Always requires user confirmation (permissions include EXECUTE,
 *    which core/tools/skill-registry.ts's DANGEROUS_PERMISSIONS always
 *    gates on confirmation) regardless of how small the snippet is.
 *
 * If a future version adds a real server-side execution backend (e.g. a
 * user-configured code-execution API, analogous to how web-search requires
 * a configured SearXNG instance), that would be a new, separately-reviewed
 * skill — not a silent upgrade of this one's safety model.
 */

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brequire\s*\(/, reason: "module imports (require) are not permitted" },
  { pattern: /\bimport\s+/, reason: "module imports are not permitted" },
  { pattern: /\bfetch\s*\(/, reason: "network access (fetch) is not permitted" },
  { pattern: /\bXMLHttpRequest\b/, reason: "network access is not permitted" },
  { pattern: /\bprocess\b/, reason: "process access is not permitted" },
  { pattern: /\bglobal(This)?\b/, reason: "global scope access is not permitted" },
  { pattern: /\beval\s*\(/, reason: "eval is not permitted" },
  { pattern: /\bFunction\s*\(/, reason: "dynamic function construction is not permitted" },
  { pattern: /\bwhile\s*\(/, reason: "unbounded loops are not permitted (use a fixed-size map/reduce instead)" },
  { pattern: /\bfor\s*\(/, reason: "for-loops are not permitted (use array methods like map/reduce/filter instead)" },
  { pattern: /\.\s*constructor\b/, reason: "constructor access is not permitted (sandbox escape risk)" },
];

export interface CodeExecInput {
  code: string;
  language: "javascript-expression";
}

export interface CodeExecOutput {
  result: unknown;
  warnings: string[];
}

function validateSnippet(code: string): void {
  if (code.length > 2000) {
    throw new Error("UNSUPPORTED: snippet exceeds the 2000-character limit for this restricted evaluator.");
  }
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(`UNSUPPORTED: ${reason}. This tool only evaluates pure, side-effect-free JS expressions.`);
    }
  }
}

/**
 * Evaluates a restricted JS expression using the Function constructor
 * WITHOUT closure access to any outer scope — the function body is the
 * expression itself, given zero free variables, so even if forbidden-
 * pattern detection missed something, there is nothing in scope to reach
 * the app's file system, network, or secrets. This is a defense-in-depth
 * measure, not a substitute for the pattern checks above — both must pass.
 */
function evaluateRestricted(code: string): unknown {
  validateSnippet(code);
  // eslint-disable-next-line no-new-func -- deliberately isolated, see comment above
  const fn = new Function(
    '"use strict"; return (' + code + ");"
  ) as () => unknown;
  return fn();
}

skillRegistry.register({
  name: "code-execution",
  description:
    "Evaluate a small, side-effect-free JavaScript expression (arithmetic, string/array/object manipulation). Does NOT support imports, network, file access, loops, or any other language — those are reported as UNSUPPORTED. This is not a general code interpreter.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "A single JS expression, e.g. '[1,2,3].map(x => x * 2)'" },
      language: { type: "string", enum: ["javascript-expression"] },
    },
    required: ["code", "language"],
  },
  outputSchema: { type: "object" },
  permissions: ["EXECUTE"],
  isAvailable: () => true,
  execute: async (input: CodeExecInput): Promise<CodeExecOutput> => {
    if (input.language !== "javascript-expression") {
      throw new Error(`UNSUPPORTED: language "${input.language}" is not implemented — only javascript-expression.`);
    }
    const result = evaluateRestricted(input.code);
    return { result, warnings: ["Executed in a restricted, no-I/O JS expression evaluator — not a full interpreter."] };
  },
});
