module.exports = {
  preset: "ts-jest",
  testMatch: ["**/*.test.ts", "**/*.test.slow.ts", "**/*.test.perf.ts"],
  watchPlugins: ["../config/jestWatchPlugin"],
  coverageProvider: "v8",
  coverageReporters: ["text-summary", "json", "clover", "text"],
  testPathIgnorePatterns: [".*\\.test\\.slow\\.ts$", ".*\\.test\\.perf\\.ts$"],
  // TODO: Reconfiguring legacy defaults, we want to upgrade these eventually
  // https://jestjs.io/blog/2021/05/25/jest-27#flipping-defaults
  testRunner: "jest-jasmine2", // TODO: Remove `jest-jasmine2` dependency if we remove this
  fakeTimers: { legacyFakeTimers: true },
};
