module.exports = {
  preset: "jest-expo",
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/ui/**", // UI components covered by RTL/E2E, not unit coverage target
  ],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
};
