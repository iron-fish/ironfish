/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MEMO_LENGTH } from '@ironfish/rust-nodejs'
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

export class MaxMemoLengthError extends Error {
  name = this.constructor.name
  constructor(memo: Buffer) {
    super()
    const utf8String = memo.toString('utf-8')
    this.message = `Memo exceeds maximum of ${MEMO_LENGTH} bytes: ${memo.toString(
      'hex',
    )} (${utf8String})`
  }
}

export class DuplicateAccountNameError extends Error {
  name = this.constructor.name

  constructor(name: string) {
    super()
    this.message = `Account already exists with the name ${name}`
  }
}
