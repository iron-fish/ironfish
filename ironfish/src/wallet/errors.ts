/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MEMO_LENGTH } from '@ironfish/rust-nodejs'
import { CurrencyUtils } from '../utils'

export class NotEnoughFundsError extends Error {
  name = this.constructor.name
  assetId: string
  amount: bigint
  amountNeeded: bigint

  constructor(assetId: Buffer, amount: bigint, amountNeeded: bigint) {
    super()
    this.assetId = assetId.toString('hex')
    this.amount = amount
    this.amountNeeded = amountNeeded

    const renderedAmountNeeded = CurrencyUtils.render(amountNeeded, true, this.assetId)
    const renderedAmount = CurrencyUtils.render(amount)
    this.message = `Insufficient funds: Needed ${renderedAmountNeeded} but have ${renderedAmount} available to spend. Please fund your account and/or wait for any pending transactions to be confirmed.`
  }
}

export class MaxMemoLengthError extends Error {
  name = this.constructor.name
  constructor(memo: Buffer) {
    super()
    const utf8String = memo.toString('utf-8')
    this.message = `Memo exceeds maximum of ${MEMO_LENGTH} bytes (length=${
      memo.byteLength
    }): ${memo.toString('hex')} (${utf8String})`
  }
}

export class MaxTransactionSizeError extends Error {
  name = this.constructor.name
  constructor(maxTransactionSize: number) {
    super()
    this.message = `Proposed transaction is larger than maximum transaction size of ${maxTransactionSize} bytes`
  }
}

export class DuplicateAccountNameError extends Error {
  name = this.constructor.name

  constructor(name: string) {
    super()
    this.message = `Account already exists with the name ${name}`
  }
}

export class DuplicateIdentityError extends Error {
  name = this.constructor.name

  constructor(identity: string) {
    super()
    this.message = `Multisig participant already exists for the identity ${identity}`
  }
}

export class DuplicateSpendingKeyError extends Error {
  name = this.constructor.name

  constructor(name: string) {
    super()
    this.message = `Account already exists with provided spending key: ${name}`
  }
}

export class DuplicateMultisigSecretNameError extends Error {
  name = this.constructor.name

  constructor(name: string) {
    super()
    this.message = `Multisig secret already exists with the name ${name}`
  }
}

export class AccountDecryptionFailedError extends Error {
  name = this.constructor.name

  constructor() {
    super()
    this.message = 'Failed to decrypt wallet'
  }
}
