/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MemPool } from '../memPool'
import { TransactionOrHash } from '../network/peerNetwork'
import { CompactBlock } from '../primitives/block'

interface Indexable {
  index: number
}

function* fromDifferentialIndex<T extends Indexable>(list: T[]): Generator<T> {
  let previousPos = -1
  for (const elem of list) {
    const absolutePos = previousPos + elem.index + 1
    yield { ...elem, index: absolutePos }
    previousPos = absolutePos
  }
}

function toDifferentialIndex(list: number[]): number[] {
  return list.map((val, i) => {
    return i === 0 ? val : val - list[i - 1] - 1
  })
}

function assembleTransactions(
  memPool: MemPool,
  block: CompactBlock,
):
  | {
      ok: true
      partialTransactions: TransactionOrHash[]
      missingTransactions: number[]
    }
  | { ok: false } {
  const absoluteIndexTransactions = fromDifferentialIndex(block.transactions)

  const numHashes = block.transactionHashes.length
  let hashesConsumed = 0
  let fullTransactionsConsumed = 0
  let nextFullTransaction = absoluteIndexTransactions.next()

  const partialTransactions: TransactionOrHash[] = []
  const absoluteMissingTransactions: number[] = []

  while (hashesConsumed < numHashes || !nextFullTransaction.done) {
    const currPosition = hashesConsumed + fullTransactionsConsumed

    // If we have no more full transactions or a transaction doesn't belong in this position
    if (nextFullTransaction.done || currPosition !== nextFullTransaction.value.index) {
      if (hashesConsumed === numHashes) {
        // We ran out of hashes to populate
        return { ok: false }
      }

      const hash = block.transactionHashes[hashesConsumed]
      const transaction = memPool.get(hash)
      const resolved: TransactionOrHash = transaction
        ? {
            type: 'FULL',
            value: transaction,
          }
        : {
            type: 'HASH',
            value: hash,
          }
      if (resolved.type === 'HASH') {
        absoluteMissingTransactions.push(currPosition)
      }

      partialTransactions.push(resolved)
      hashesConsumed++
      continue
    }

    partialTransactions.push({
      type: 'FULL',
      value: nextFullTransaction.value.transaction,
    })
    nextFullTransaction = absoluteIndexTransactions.next()
    fullTransactionsConsumed++
  }

  return {
    ok: true,
    partialTransactions,
    missingTransactions: toDifferentialIndex(absoluteMissingTransactions),
  }
}

export const MemPoolUtils = { assembleTransactions }
