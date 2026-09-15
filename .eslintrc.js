module.exports = {
  root: true,
  extends: ["expo"],
  ignorePatterns: ["/dist/*", "node_modules/", ".expo/"],
  rules: {
    // Security-relevant rules kept as errors rather than warnings, since
    // this app handles API keys and untrusted model-produced tool calls.
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "off", // code-execution-skill.ts uses this deliberately, isolated, with a documented justification
  },
};
