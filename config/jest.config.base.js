module.exports = {
  preset: "ts-jest",
  testMatch: ["**/*.test.ts", "**/*.test.slow.ts", "**/*.test.perf.ts"],
  watchPlugins: ["../config/jestWatchPlugin"],
  coverageProvider: "v8",
  coverageReporters: ["text-summary", "json", "clover", "text"],
  testPathIgnorePatterns: [".*\\.test\\.slow\\.ts$", ".*\\.test\\.perf\\.ts$"],
  fakeTimers: { legacyFakeTimers: true },
};
