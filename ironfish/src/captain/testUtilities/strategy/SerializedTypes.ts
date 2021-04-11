/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Spend } from '../../../strategy/transaction'

type SerializedSpend<H> = Omit<Spend<H>, 'nullifier'> & { nullifier: string }

export type SerializedTestTransaction<H = string> = {
  elements: string[]
  spends: SerializedSpend<H>[]
  totalFees: string
  isValid: boolean
}
