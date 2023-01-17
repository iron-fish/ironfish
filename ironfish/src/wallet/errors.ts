/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CurrencyUtils } from "../utils"

export class NotEnoughFundsError extends Error {
  name = this.constructor.name

  constructor(assetId: Buffer, amount: bigint, amountNeeded: bigint) {
    super()
    this.message = `Insufficient funds: Needed ${CurrencyUtils.renderIron(amountNeeded.toString())} but have '${CurrencyUtils.renderIron(amount, true, assetId.toString('hex',))}'`
  }
}
