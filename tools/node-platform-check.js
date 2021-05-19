/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

if (process.platform === 'darwin' && process.arch === 'arm64') {
    console.error(`Iron Fish is not currently supported on Apple Silicon. Follow this Github issue for updates on progress: https://github.com/iron-fish/ironfish/issues/9`)
    process.exitCode = 1   
}