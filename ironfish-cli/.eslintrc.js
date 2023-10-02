module.exports = {
  extends: ['ironfish'],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
  rules: {
    'jest/no-standalone-expect': 'off',
  },
}
