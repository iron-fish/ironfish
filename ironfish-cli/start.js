/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const execSync = require('child_process').execSync

const arg = process.argv.slice(2) || ''

execSync(`tsc-watch --build --onSuccess " while true do yarn run start:js ${arg.join(' ')} done"`, {
  stdio: [0, 1, 2],
})

