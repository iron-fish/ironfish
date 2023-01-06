/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class NotEnoughFundsError extends Error {
  name = this.constructor.name

  constructor(assetId: Buffer, amount: bigint, amountNeeded: bigint) {
    super()
    this.message = `Insufficient funds: Needed ${amountNeeded.toString()} but have ${amount.toString()} for asset '${assetId.toString(
      'hex',
    )}'`
  }
}
