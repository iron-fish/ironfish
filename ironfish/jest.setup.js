/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const fs = require('fs')
const path = require('path')

const TEST_DATA_DIR = path.join(process.cwd(), 'testdbs')

module.exports = async () => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  }

  fs.mkdirSync(TEST_DATA_DIR)
}
