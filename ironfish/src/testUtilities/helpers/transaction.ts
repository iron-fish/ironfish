/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { Blockchain } from '../../blockchain'
import { BurnDescription } from '../../primitives/burnDescription'
import { MintDescription } from '../../primitives/mintDescription'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { RawTransaction } from '../../primitives/rawTransaction'
import { Transaction } from '../../primitives/transaction'
import { Account, Wallet } from '../../wallet'
import { WorkerPool } from '../../workerPool'

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

export async function buildRawTransaction(
  chain: Blockchain,
  pool: WorkerPool,
  sender: Account,
  notesToSpend: NoteEncrypted[],
  receives: { publicAddress: string; amount: bigint; memo: string; assetIdentifier: Buffer }[],
  mints: MintDescription[],
  burns: BurnDescription[],
): Promise<Transaction> {
  const spends = await Promise.all(
    notesToSpend.map(async (n) => {
      const note = n.decryptNoteForOwner(sender.incomingViewKey)
      Assert.isNotUndefined(note)
      const treeIndex = await chain.notes.leavesIndex.get(n.merkleHash())
      Assert.isNotUndefined(treeIndex)
      const witness = await chain.notes.witness(treeIndex)
      Assert.isNotNull(witness)

      return {
        note,
        treeSize: witness.treeSize(),
        authPath: witness.authenticationPath,
        rootHash: witness.rootHash,
      }
    }),
  )

  return pool.createTransaction(
    sender.spendingKey,
    spends,
    receives,
    mints,
    burns,
    BigInt(0),
    0,
  )
}

export async function createRawTransaction(options: {
  wallet: Wallet
  from: Account
  to?: Account
  fee?: bigint
  amount?: bigint
  expiration?: number
  assetIdentifier?: Buffer
  receives?: {
    publicAddress: string
    amount: bigint
    memo: string
    assetIdentifier: Buffer
  }[]
  mints?: MintDescription[]
  burns?: BurnDescription[]
}): Promise<RawTransaction> {
  const receives = options.receives ?? []

  if (options.to) {
    receives.push({
      publicAddress: options.to.publicAddress,
      amount: options.amount ?? 1n,
      memo: '',
      assetIdentifier: options.assetIdentifier ?? Asset.nativeIdentifier(),
    })
  }

  return await options.wallet.createTransaction(
    options.from,
    receives,
    options.mints ?? [],
    options.burns ?? [],
    options.fee ?? 0n,
    options.expiration ?? 0,
  )
}
