/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { BurnDescription } from '../../primitives/burnDescription'
import { MintData, RawTransaction } from '../../primitives/rawTransaction'
import { Transaction } from '../../primitives/transaction'
import { Account, Wallet } from '../../wallet'

export function isTransactionMine(transaction: Transaction, account: Account): boolean {
  for (const note of transaction.notes) {
    const receivedNote = note.decryptNoteForOwner(account.incomingViewKey)
    if (receivedNote) {
      return true
    }

    const spentNote = note.decryptNoteForSpender(account.outgoingViewKey)
    if (spentNote) {
      return true
    }
  }

  return false
}

export async function createRawTransaction(options: {
  wallet: Wallet
  from: Account
  to?: Account
  fee?: bigint
  amount?: bigint
  expiration?: number
  assetId?: Buffer
  outputs?: {
    publicAddress: string
    amount: bigint
    memo: Buffer
    assetId: Buffer
  }[]
  mints?: MintData[]
  burns?: BurnDescription[]
}): Promise<RawTransaction> {
  const outputs = options.outputs ?? []

  if (options.to) {
    outputs.push({
      publicAddress: options.to.publicAddress,
      amount: options.amount ?? 1n,
      memo: Buffer.alloc(32),
      assetId: options.assetId ?? Asset.nativeId(),
    })
  }

  return await options.wallet.createTransaction({
    account: options.from,
    outputs,
    mints: options.mints,
    burns: options.burns,
    fee: options.fee ?? 0n,
    expiration: options.expiration ?? 0,
    expirationDelta: 0,
  })
}
