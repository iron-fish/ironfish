module.exports = {
  extends: ['ironfish'],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: ["/src/flags.ts"],
  rules: {
    'jest/no-standalone-expect': 'off',
  },
}
