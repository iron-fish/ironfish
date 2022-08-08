module.exports = {
  preset: "ts-jest",
  testMatch: ["**/*.test.ts", "**/*.test.slow.ts", "**/*.test.perf.ts"],
  testEnvironment: "../config/jestNodeEnvironment",
  watchPlugins: ["../config/jestWatchPlugin"],
  coverageProvider: "v8",
  coverageReporters: ["text-summary", "json", "clover", "text"],
  testPathIgnorePatterns: ['.*\\.test\\.slow\\.ts$', '.*\\.test\\.perf\\.ts$'],

  // set timeout to a higher value than the default (5000), in order to avoid 
  // timing out when running tests. 32 seconds should suffice for the existing
  // tests.
  testTimeout: 32000
};
