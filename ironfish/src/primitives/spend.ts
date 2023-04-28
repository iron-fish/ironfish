/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Nullifier } from './nullifier'

export const SPEND_SERIALIZED_SIZE_IN_BYTE = 356

export interface Spend {
  nullifier: Nullifier
  commitment: Buffer
  size: number
}
