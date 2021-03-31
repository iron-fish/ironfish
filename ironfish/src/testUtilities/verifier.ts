/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Verifier } from '../captain'
import {
  IronfishBlockchain,
  IronfishNoteEncrypted,
  IronfishTransaction,
  SerializedTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
} from '../strategy'

export class IronfishTestVerifier extends Verifier<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
> {
  constructor(chain: IronfishBlockchain) {
    super(chain)
    this.enableVerifyTarget = false
  }
}
