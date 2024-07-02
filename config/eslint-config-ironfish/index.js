'use strict'

module.exports = {
  root: true,

  ignorePatterns: [],

  env: {
    es6: true,
    node: true,
  },

  parserOptions: {
    ecmaVersion: '2018',
    sourceType: 'module',
  },

  plugins: ['header', 'ironfish', 'jest', 'prettier', 'simple-import-sort'],

  extends: ['eslint:recommended', 'plugin:prettier/recommended', 'prettier'],

  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
      plugins: ['@typescript-eslint'],
      extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
      ],
    },
    {
      files: ['**/*.{spec,test}.*'],
      extends: ['plugin:jest/recommended'],
      rules: {
        // It's common to want to mock functions with noops. This could be
        // turned off for non-test code as well if it's a common pattern.
        '@typescript-eslint/no-empty-function': 'off',
        // Jest's asymmetric matchers (e.g expect.any(Date)) are typed with
        // any return values. Fixing this either requires casting every use
        // the matchers to unknown, or defining a custom matcher, which seems
        // like too much friction for test-writing.
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        // It's common to want to mock unbound methods.
        '@typescript-eslint/unbound-method': 'off',
        // Using try catch with expect.assertions(n) is the recommended way to
        // test async code where you need a reference to the error to validate the
        // type and properties
        'jest/no-conditional-expect': 'off',
        'jest/no-try-expect': 'off',
        // It's common to want to compare non-primitive types using expect
        // statements grouped in a helper function.
        'jest/expect-expect': [
          'error',
          {
            'assertFunctionNames': ['expect*'],
          }
        ],
      },
    },
  ],

  rules: {
    'ironfish/no-vague-imports': 'error',
    'ironfish/no-buffer-cmp': 'error',
    'ironfish/no-promise-race': 'error',

    // Catches expressions that aren't assigned
    '@typescript-eslint/no-unused-expressions': [
      'error',
      { allowShortCircuit: true, allowTernary: true },
    ],

    // Seems to be needed to allow for custom jest matchers
    '@typescript-eslint/no-namespace': [
      'error',
      {
        allowDeclarations: true,
      },
    ],

    // Allows for using _ to strip off variables via destructuring, e.g.
    // const { ignore: _ignored, ...rest } = node
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      },
    ],

    curly: 'error',
    eqeqeq: ['error', 'smart'],
    'header/header': [
      2,
      'block',
      [
        ' This Source Code Form is subject to the terms of the Mozilla Public',
        ' * License, v. 2.0. If a copy of the MPL was not distributed with this',
        ' * file, You can obtain one at https://mozilla.org/MPL/2.0/. ',
      ],
    ],

    // Prefer using the Logger library rather than directly using the console for output.
    'no-console': 'error',
    'no-new-wrappers': 'error',
    'simple-import-sort/imports': [
      'error',
      {
        groups: [['\\u0000', '^@?\\w', '^', '\\.']],
      },
    ],
  },
}
