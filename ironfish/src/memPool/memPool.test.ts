/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import * as ConsensusUtils from '../consensus/utils'
import { getTransactionSize } from '../network/utils/serializers'
import { DEVNET } from '../networks'
import { FullNode } from '../node'
import { Transaction } from '../primitives'
import { TransactionVersion } from '../primitives/transaction'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithCustomTxs,
  useBlockWithTx,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'
import { Account, TransactionOutput } from '../wallet'
import { getPreciseFeeRate } from './feeEstimator'
import { mempoolEntryComparator } from './memPool'

// Creates transactions out of the list of fees and adds them to the wallet
// but not the mempool
async function createTransactions(node: FullNode, from: Account, to: Account, fees: number[]) {
  const transactions: Transaction[] = []

  for (const fee of fees) {
    const { transaction } = await useBlockWithTx(node, from, to, true, { fee })
    await node.wallet.addPendingTransaction(transaction)
    transactions.push(transaction)
  }

  return transactions
}

describe('MemPool', () => {
  describe('size', () => {
    const nodeTest = createNodeTest()

    it('returns the number of transactions in the node', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction } = await useBlockWithTx(node, accountA, accountB)

      memPool.acceptTransaction(transaction)

      expect(memPool.count()).toBe(1)
    })
  })

  describe('sizeBytes', () => {
    const nodeTest = createNodeTest()

    it('returns the size of memory usage for transactions and nullifiers', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const accountC = await useAccountFixture(wallet, 'accountC')
      const accountD = await useAccountFixture(wallet, 'accountD')
      const { transaction, block } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        undefined,
        undefined,
      )
      await node.wallet.addPendingTransaction(transaction)
      const { transaction: transaction2 } = await useBlockWithTx(
        node,
        accountC,
        accountD,
        undefined,
        undefined,
      )

      memPool.acceptTransaction(transaction)

      const size = (tx: Transaction) => {
        return getTransactionSize(tx)
      }

      expect(memPool.sizeBytes()).toBe(size(transaction))

      // If we accept the same transaction it should not add to the memory size
      memPool.acceptTransaction(transaction)

      expect(memPool.sizeBytes()).toBe(size(transaction))

      // If we add another it should include that in size
      memPool.acceptTransaction(transaction2)

      expect(memPool.sizeBytes()).toBe(size(transaction) + size(transaction2))

      // If we remove the first transaction it should reflect that
      memPool.onConnectBlock(block)

      expect(memPool.sizeBytes()).toBe(size(transaction2))

      // If we remove the first transaction a second time it should not reduce the size again
      memPool.onConnectBlock(block)

      expect(memPool.sizeBytes()).toBe(size(transaction2))
    })
  })

  describe('exists', () => {
    describe('with a missing hash', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, undefined)

        expect(memPool.exists(transaction.hash())).toBe(false)
      })
    })

    describe('with a valid hash', () => {
      const nodeTest = createNodeTest()

      it('returns true', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, undefined)

        memPool.acceptTransaction(transaction)

        expect(memPool.exists(transaction.hash())).toBe(true)
      })
    })
  })

  describe('orderedTransactions', () => {
    const nodeTest = createNodeTest()

    it('returns transactions sorted by fee rate deterministically', async () => {
      const from = await useAccountFixture(nodeTest.wallet, 'account')

      const outputs: TransactionOutput[] = [...new Array(10)].map(() => {
        return {
          publicAddress: from.publicAddress,
          amount: 1n,
          assetId: Asset.nativeId(),
          memo: Buffer.alloc(32, '', 'hex'),
        }
      })

      const transactionInputs = [
        { from, fee: 1n, outputs },
        { from, fee: 2n, outputs },
        { from, fee: 3n, outputs },
        { from, fee: 4n, outputs },
      ]
      const { transactions } = await useBlockWithCustomTxs(nodeTest.node, transactionInputs)

      for (const transaction of transactions) {
        nodeTest.node.memPool.acceptTransaction(transaction)
      }

      const orderedTransactions = [...nodeTest.node.memPool.orderedTransactions()]

      expect(orderedTransactions.length).toEqual(4)
      expect(orderedTransactions[0].hash()).toEqual(transactions[3].hash())
      expect(orderedTransactions[1].hash()).toEqual(transactions[2].hash())
      expect(orderedTransactions[2].hash()).toEqual(transactions[1].hash())
      expect(orderedTransactions[3].hash()).toEqual(transactions[0].hash())
    })

    it('returns transactions from the node mempool sorted by fee rate', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 10 },
      )
      // add transaction to wallet to avoid spending same notes
      await wallet.addPendingTransaction(transactionA)

      const { transaction: transactionB } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 5 },
      )
      // add transaction to wallet to avoid spending same notes
      await wallet.addPendingTransaction(transactionB)

      const { transaction: transactionC } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 1 },
      )
      // add transaction to wallet to avoid spending same notes
      await wallet.addPendingTransaction(transactionC)

      expect(getPreciseFeeRate(transactionA).gt(getPreciseFeeRate(transactionB))).toBe(true)
      expect(getPreciseFeeRate(transactionB).gt(getPreciseFeeRate(transactionC))).toBe(true)

      expect(memPool.acceptTransaction(transactionB)).toBe(true)
      expect(memPool.acceptTransaction(transactionA)).toBe(true)
      expect(memPool.acceptTransaction(transactionC)).toBe(true)

      const transactions = Array.from(memPool.orderedTransactions())
      expect(transactions).toEqual([transactionA, transactionB, transactionC])
    })

    it('does not return transactions that have been removed from the mempool', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 1 },
      )
      const { transaction: transactionB } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 4 },
      )

      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionB)

      const generator = memPool.orderedTransactions()
      const result = generator.next()
      expect(result.done).toBe(false)

      memPool['deleteTransaction'](transactionA)
      memPool['deleteTransaction'](transactionB)

      const transactions = Array.from(generator)
      expect(transactions).toEqual([])
    })
  })

  describe('acceptTransaction', () => {
    describe('with an existing hash in the mempool', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, undefined)

        memPool.acceptTransaction(transaction)

        expect(memPool.acceptTransaction(transaction)).toBe(false)
      })
    })

    describe('with an expired sequence', () => {
      const nodeTest = createNodeTest()

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, undefined)

        const isExpiredSequenceSpy = jest
          .spyOn(ConsensusUtils, 'isExpiredSequence')
          .mockReturnValue(true)

        expect(memPool.acceptTransaction(transaction)).toBe(false)
        expect(isExpiredSequenceSpy).toHaveBeenCalledTimes(1)
        expect(isExpiredSequenceSpy).toHaveLastReturnedWith(true)
      })
    })

    describe('with an expired version', () => {
      const assetOwnershipNetworkDefinition = {
        ...DEVNET,
        consensus: {
          ...DEVNET.consensus,
          enableAssetOwnership: 1,
        },
        id: 999,
      }
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node, wallet } = await nodeTest.createSetup({
          networkDefinition: assetOwnershipNetworkDefinition,
        })
        const account = await useAccountFixture(wallet)
        const { transaction } = await useBlockWithTx(node, account)

        jest.spyOn(transaction, 'version').mockReturnValue(TransactionVersion.V1)

        expect(node.memPool.acceptTransaction(transaction)).toBe(false)
      })
    })

    describe('with an existing nullifier in a transaction in the mempool', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, undefined)
        const { transaction: transaction2 } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          false,
          undefined,
        )

        expect(transaction.getSpend(0).nullifier).toEqual(transaction2.getSpend(0).nullifier)

        memPool.acceptTransaction(transaction)

        expect(memPool.acceptTransaction(transaction2)).toBe(false)
      })

      it('returns true with a higher fee', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, { fee: 1 })
        const { transaction: transaction2 } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          false,
          { fee: 5 },
        )

        expect(transaction.getSpend(0).nullifier).toEqual(transaction2.getSpend(0).nullifier)

        memPool.acceptTransaction(transaction)

        expect(memPool.acceptTransaction(transaction2)).toBe(true)
      })
    })

    describe('with a transaction that internally double spends', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const { block, transaction } = await useBlockWithTx(
          node,
          accountA,
          accountA,
          true,
          undefined,
        )
        await expect(node.chain).toAddBlock(block)
        await node.wallet.scan()

        const note = transaction.getNote(1).decryptNoteForOwner(accountA.incomingViewKey)
        Assert.isNotUndefined(note)
        const noteHash = note.hash()

        const tx = await useTxFixture(wallet, accountA, accountA, async () => {
          const raw = await wallet.createTransaction({
            account: accountA,
            notes: [noteHash, noteHash],
            fee: 0n,
          })
          return await wallet.workerPool.postTransaction(raw, accountA.spendingKey)
        })

        // Verify that this transaction is attempting to double spend
        expect(tx.spends.length).toEqual(2)
        expect(tx.spends[0].nullifier).toEqual(tx.spends[1].nullifier)

        expect(memPool.acceptTransaction(tx)).toBe(false)
      })
    })

    describe('with a new hash', () => {
      const nodeTest = createNodeTest()

      it('returns true', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, undefined)

        expect(memPool.acceptTransaction(transaction)).toBe(true)
      })

      it('sets the transaction hash in the mempool map and priority queue', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB, true, undefined)

        memPool.acceptTransaction(transaction)

        expect(memPool.exists(transaction.hash())).toBe(true)
        expect([...memPool.orderedTransactions()]).toContainEqual(transaction)
      })

      it('adds the transaction to the transaction version priority queue', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const account = await useAccountFixture(wallet)
        const { transaction } = await useBlockWithTx(node, account)

        expect(memPool.acceptTransaction(transaction)).toEqual(true)

        expect(memPool['versionQueue'].has(transaction.hash().toString('hex'))).toEqual(true)
      })
    })
  })

  describe('when a block is connected with a transaction in the mempool', () => {
    const nodeTest = createNodeTest()

    it('removes the block transactions and expired transactions from the mempool', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node

      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { expiration: 4 },
      )

      expect(chain.head.sequence).toEqual(2)

      const { block, transaction: transactionB } = await useBlockWithTx(
        node,
        accountB,
        accountA,
        true,
        undefined,
      )

      expect(chain.head.sequence).toEqual(3)

      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionB)
      expect(memPool.get(transactionA.hash())).toBeDefined()
      expect(memPool.get(transactionB.hash())).toBeDefined()

      await chain.addBlock(block)

      expect(chain.head.sequence).toEqual(4)

      expect(memPool.exists(transactionA.hash())).toBe(false)
      expect(memPool.exists(transactionB.hash())).toBe(false)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionA)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionB)
    })

    it('removes expired transactions from the mempool even if there are 0 expiration transactions', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node

      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { expiration: 4 },
      )
      await wallet.addPendingTransaction(transactionA)

      expect(chain.head.sequence).toEqual(2)

      const { transaction: transactionB } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { expiration: 0 },
      )

      expect(chain.head.sequence).toEqual(3)

      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionB)
      expect(memPool.get(transactionA.hash())).toBeDefined()
      expect(memPool.get(transactionB.hash())).toBeDefined()

      const block4 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block4)

      expect(chain.head.sequence).toEqual(4)

      expect(memPool.exists(transactionA.hash())).toBe(false)
      expect(memPool.get(transactionB.hash())).toBeDefined()
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionA)
      expect([...memPool.orderedTransactions()]).toContainEqual(transactionB)
    })

    it('removes transactions with an expired version from the mempool', async () => {
      const { node, chain, wallet } = nodeTest
      const { memPool } = node
      const account = await useAccountFixture(wallet)

      // Enable V1 transactions to setup the test transactions
      chain.consensus.parameters.enableAssetOwnership = 999999

      const block1 = await useMinerBlockFixture(chain, undefined, account)
      await expect(chain).toAddBlock(block1)
      await wallet.scan()

      const block2 = await useMinerBlockFixture(chain, undefined, account)
      await expect(chain).toAddBlock(block2)
      await wallet.scan()

      const transaction1 = await useTxFixture(wallet, account, account)
      expect(memPool.acceptTransaction(transaction1)).toBe(true)

      // Re-enable V2 transactions
      chain.consensus.parameters.enableAssetOwnership = 1

      const transaction2 = await useTxFixture(wallet, account, account)
      expect(memPool.acceptTransaction(transaction2)).toBe(true)

      expect(memPool.get(transaction1.hash())).toBeDefined()
      expect(memPool.get(transaction2.hash())).toBeDefined()
      expect(memPool['versionQueue'].size()).toEqual(2)

      const block3 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block3)

      expect(memPool.exists(transaction1.hash())).toBe(false)
      expect(memPool.get(transaction1.hash())).toBeUndefined()
      expect(memPool['versionQueue'].has(transaction1.hash().toString('hex'))).toEqual(false)
      expect(memPool['versionQueue'].has(transaction2.hash().toString('hex'))).toEqual(true)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transaction1)
      expect([...memPool.orderedTransactions()]).toContainEqual(transaction2)
    })
  })

  describe('when a block is disconnected', () => {
    const nodeTest = createNodeTest()

    it('adds the block transactions to the mempool', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { block, transaction } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        undefined,
      )
      const minersFee = block.transactions[0]

      Assert.isNotUndefined(minersFee)
      Assert.isNotUndefined(transaction)

      await chain.addBlock(block)

      await chain.removeBlock(block.header.hash)

      expect(memPool.get(transaction.hash())).toBeDefined()
      expect(memPool.orderedTransactions()).toContainEqual(transaction)

      expect(memPool.exists(minersFee.hash())).toBe(false)
      expect(memPool.orderedTransactions()).not.toContainEqual(minersFee)
    })

    it('does not add back in transactions with overlapping nullifiers if fee is smaller', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')

      const minersBlock = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(minersBlock)
      await node.wallet.scan()

      const transaction1 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        1n,
        undefined,
        false,
      )

      const transaction2 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        2n,
        undefined,
        false,
      )

      expect(transaction1.spends[0].nullifier.equals(transaction2.spends[0].nullifier)).toBe(
        true,
      )
      expect(transaction1.hash().equals(transaction2.hash())).toBe(false)

      const block = await useMinerBlockFixture(node.chain, undefined, accountA, undefined, [
        transaction1,
      ])

      await chain.addBlock(block)

      memPool.acceptTransaction(transaction2)

      await chain.removeBlock(block.header.hash)

      expect(memPool.exists(transaction1.hash())).toBe(false)
      expect(memPool.get(transaction2.hash())).toBeDefined()
    })

    it('adds back in transactions with overlapping nullifiers if fee is greater', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')

      const minersBlock = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(minersBlock)
      await node.wallet.scan()

      const transaction1 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        2n,
        undefined,
        false,
      )

      const transaction2 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        1n,
        undefined,
        false,
      )

      expect(transaction1.spends[0].nullifier.equals(transaction2.spends[0].nullifier)).toBe(
        true,
      )
      expect(transaction1.hash().equals(transaction2.hash())).toBe(false)

      const block = await useMinerBlockFixture(node.chain, undefined, accountA, undefined, [
        transaction1,
      ])

      await chain.addBlock(block)

      memPool.acceptTransaction(transaction2)

      await chain.removeBlock(block.header.hash)

      expect(memPool.get(transaction1.hash())).toBeDefined()
      expect(memPool.exists(transaction2.hash())).toBe(false)
    })
  })

  describe('when the mempool reaches capacity', () => {
    const MAX_MEMPOOL_SIZE = 10000
    const MAX_CACHE_SIZE = 10
    const nodeTest = createNodeTest(false, {
      config: {
        memPoolMaxSizeBytes: MAX_MEMPOOL_SIZE,
        memPoolRecentlyEvictedCacheSize: MAX_CACHE_SIZE,
      },
    })

    it('adds low fee transactions to the recently evicted cache and flushes cache', async () => {
      const { node } = nodeTest
      const { wallet, memPool, chain } = node
      const from = await useAccountFixture(wallet, 'accountA')
      const to = await useAccountFixture(wallet, 'accountB')

      // Generate 30 transactions with the following fees
      const fees = [
        49, 44, 88, 72, 63, 23, 94, 50, 87, 81, 49, 27, 49, 41, 67, 72, 53, 85, 64, 19, 63, 98,
        62, 24, 57, 77, 35, 6, 32, 28,
      ]
      const transactions = await createTransactions(node, from, to, fees)

      for (const transaction of transactions) {
        memPool.acceptTransaction(transaction)
      }

      // Get transactions in mempool sorted order and take only those that will fit under the size
      const highToLow = memPoolSort(transactions)
      const [underLimit, overLimit] = takeBytes(MAX_MEMPOOL_SIZE, highToLow)

      const inRecentlyEvicted = overLimit.slice(-MAX_CACHE_SIZE)
      const droppedFromRecentlyEvicted = overLimit.slice(0, -MAX_CACHE_SIZE)

      // Highest value transactions under limit should still be in mempool
      for (const transaction of underLimit) {
        expect(memPool.get(transaction.hash())).toBeDefined()
        expect(memPool.recentlyEvicted(transaction.hash())).toBe(false)
      }

      // Transactions over limit should be in cache
      for (const transaction of inRecentlyEvicted) {
        expect(memPool.recentlyEvicted(transaction.hash())).toBe(true)
        expect(memPool.get(transaction.hash())).toBeUndefined()
      }

      // Transactions over limit that did not fit in cache either should be dropped
      for (const transaction of droppedFromRecentlyEvicted) {
        expect(memPool.recentlyEvicted(transaction.hash())).toBe(false)
        expect(memPool.get(transaction.hash())).toBeUndefined()
        expect(memPool.exists(transaction.hash())).toBe(false)
      }

      // If we add blocks to just under the flush period transactions
      // should still be in the recentlyEvictedCache
      for (let i = 0; i++; i < memPool.sizeInBlocks() - 1) {
        const block = await useMinerBlockFixture(chain)
        await expect(chain).toAddBlock(block)
      }

      for (const transaction of inRecentlyEvicted) {
        expect(memPool.recentlyEvicted(transaction.hash())).toBe(true)
      }

      // If we add one more block all those transactions should be flushed
      const block = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block)

      for (const transaction of inRecentlyEvicted) {
        expect(memPool.recentlyEvicted(transaction.hash())).toBe(false)
        expect(memPool.exists(transaction.hash())).toBe(false)
      }
    })
  })
})

function memPoolSort(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((t1, t2) => {
    const greater = mempoolEntryComparator(
      { hash: t1.hash(), feeRate: getPreciseFeeRate(t1) },
      { hash: t2.hash(), feeRate: getPreciseFeeRate(t2) },
    )
    return greater ? -1 : 1
  })
}

// return the first transactions that fit within the target byte size
// and return the remaining transactions that don't fit
function takeBytes(
  targetBytes: number,
  transactions: Transaction[],
): [Transaction[], Transaction[]] {
  let totalBytes = 0
  const underLimit: Transaction[] = []
  const overLimit: Transaction[] = []

  for (const transaction of transactions) {
    totalBytes += getTransactionSize(transaction)

    if (totalBytes <= targetBytes) {
      underLimit.push(transaction)
    } else {
      overLimit.push(transaction)
    }
  }

  return [underLimit, overLimit]
}
