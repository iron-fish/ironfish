/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WasmNoteEncryptedHash } from './noteEncrypted'
import { Nullifier } from './nullifier'

/**
 * TODO: Why is a spends commitment a note hash?
 */
export interface Spend {
  nullifier: Nullifier
  commitment: WasmNoteEncryptedHash
  size: number
}
