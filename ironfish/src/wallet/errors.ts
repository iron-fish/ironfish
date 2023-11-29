/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CurrencyUtils } from '../utils'

export class NotEnoughFundsError extends Error {
  name = this.constructor.name

  constructor(assetId: Buffer, amount: bigint, amountNeeded: bigint) {
    super()
    this.message = `Insufficient funds: Needed ${CurrencyUtils.renderIron(
      amountNeeded,
      true,
      assetId.toString('hex'),
    )} but have ${CurrencyUtils.renderIron(
      amount,
    )} available to spend. Please fund your account and/or wait for any pending transactions to be confirmed.'`
  }
}

export class NoteSpent extends Error {
  name = this.constructor.name

  constructor(noteHash: Buffer) {
    super()
    this.message = `Note ${noteHash.toString('hex')} has already been spent`
  }
}
