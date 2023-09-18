/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
module.exports = {
  extends: ['ironfish'],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
  rules: {
    'jest/no-standalone-expect': 'off',
    'deprecation/deprecation': 'off', // enable this to warn or error to show deprecated code usage
  },
  plugins: ['deprecation'],
}
