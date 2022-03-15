const pkg = require('./package.json')

module.exports = {
  preset: "ts-jest",
  displayName: pkg.name,
  testMatch: ["**/*.test.ts", "**/*.test.slow.ts", "**/*.test.perf.ts"],
  testPathIgnorePatterns: ['.*\\.test\\.slow\\.ts$', '.*\\.test\\.perf\\.ts$'],
}
