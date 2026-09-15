# Agents

## Overview

`core/agent/agent-loop.ts` implements the plan -> tool-select -> execute ->
observe -> verify -> continue loop from brief section 43, driven by the
target model's real function-calling capability rather than a separate
scripted planning stage.

```
User goal
  -> system + user message
  -> modelRouter.chat({ tools: skillRegistry.toToolDefinitions(), toolChoice: "auto" })
  -> model responds with either:
       - tool_call part(s)  -> execute each, append tool-role results, loop
       - plain text, no tool calls -> treated as task completion, loop ends
```

## Limits (brief section 43 — "avoid infinite loops")

`AgentLimits` (`core/agent/agent-types.ts`):

| Limit | Default | Enforced by |
|---|---|---|
| `maxSteps` | 15 | checked at the top of each loop iteration |
| `maxToolCalls` | 20 | checked before and during each tool-call batch |
| `timeoutMs` | 5 minutes | checked against `startedAt` each iteration |
| `maxTokenBudget` | 100,000 | accumulated from each response's `usage.totalTokens` |

Hitting any limit emits an `AgentEvent` of type `limit_reached` and ends
the task with `status: "failed"` — it never silently keeps going past a
limit, and it never loops without one of these bounds being checked.

## Permissions and confirmation

Every skill declares `permissions: PermissionLevel[]`
(`core/tools/skill-types.ts`) from `READ | WRITE | NETWORK | EXECUTE |
SYSTEM`. `WRITE`, `EXECUTE`, and `SYSTEM` are "dangerous" — the agent loop
calls `opts.onConfirmationNeeded(step, toolName, args)` before executing
any of them, and skips the step (recording why) if the caller doesn't
confirm. There is exactly one integration point for this — nothing in the
loop bypasses it.

## Verification (brief section 44)

After every tool call, if the result includes a `localUri` (i.e. it
generated a file), `agent-verifier.ts#verifyGeneratedFile` independently
re-checks:

- the file actually exists and is non-empty
- its extension matches what was expected
- for ZIP-based formats (docx/pptx/xlsx) and PDF, the first bytes match
  the real file-format magic number — not just "the write call didn't
  throw"

If verification fails, the tool result the model sees is rewritten to
include the verification failure reason, so the model can react to a real
failure instead of believing a broken file succeeded.

## Persistence

`core/agent/agent-task-store.ts` persists `AgentTask` (goal, plan steps,
status) and every individual `ToolCallRecord` (tool name, arguments,
result, permission level, whether the user confirmed it, timing) to
SQLite — this is the audit trail for what an agent run actually did.

## Known limitation

The agent's "planning" is implicit in the model's own tool-selection
behavior turn by turn, not a separate upfront plan that gets displayed and
then followed. This matches how most production tool-calling agent loops
actually work, but means there's no separately-inspectable "plan" object
before execution starts beyond the `AgentPlanStep[]` array that gets
filled in as steps happen.
