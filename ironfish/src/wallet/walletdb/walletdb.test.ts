/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useAccountFixture } from '../../testUtilities'
import { AsyncUtils } from '../../utils'

describe('WalletDB', () => {
  const nodeTest = createNodeTest()

  describe('loadNoteHashesInSequenceRange', () => {
    it('loads note hashes in the provided range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      await walletDb.sequenceToNoteHash.put(
        [account.prefix, [1, Buffer.from('1', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteHash.put(
        [account.prefix, [10, Buffer.from('10', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteHash.put(
        [account.prefix, [100, Buffer.from('100', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteHash.put(
        [account.prefix, [1000, Buffer.from('1000', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteHash.put(
        [account.prefix, [10000, Buffer.from('10000', 'hex')]],
        null,
      )

      const noteHashes = await AsyncUtils.materialize(
        walletDb.loadNoteHashesInSequenceRange(account, 2, 9999),
      )

      expect(noteHashes).toHaveLength(3)
      expect(noteHashes[0]).toEqualBuffer(Buffer.from('10', 'hex'))
      expect(noteHashes[1]).toEqualBuffer(Buffer.from('100', 'hex'))
      expect(noteHashes[2]).toEqualBuffer(Buffer.from('1000', 'hex'))
    })
  })

  describe('loadTransactionHashesInSequenceRange', () => {
    it('loads transaction hashes in the provided range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [2, Buffer.from('2', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [20, Buffer.from('20', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [200, Buffer.from('200', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [2000, Buffer.from('2000', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [20000, Buffer.from('20000', 'hex')]],
        null,
      )

      const transactionHashes = await AsyncUtils.materialize(
        walletDb.loadTransactionHashesInSequenceRange(account, 2, 9999),
      )

      expect(transactionHashes).toHaveLength(4)
      expect(transactionHashes[0]).toEqualBuffer(Buffer.from('2', 'hex'))
      expect(transactionHashes[1]).toEqualBuffer(Buffer.from('20', 'hex'))
      expect(transactionHashes[2]).toEqualBuffer(Buffer.from('200', 'hex'))
      expect(transactionHashes[3]).toEqualBuffer(Buffer.from('2000', 'hex'))
    })
  })

  describe('loadExpiredTransactionHashes', () => {
    it('loads transaction hashes with expiration sequences in the expired range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      // expiration of 0 never expires
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [0, Buffer.from('0', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [3, Buffer.from('3', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [30, Buffer.from('30', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [300, Buffer.from('300', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [3000, Buffer.from('3000', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [30000, Buffer.from('30000', 'hex')]],
        null,
      )

      const transactionHashes = await AsyncUtils.materialize(
        walletDb.loadExpiredTransactionHashes(account, 3000),
      )

      expect(transactionHashes).toHaveLength(4)
      expect(transactionHashes[0]).toEqualBuffer(Buffer.from('3', 'hex'))
      expect(transactionHashes[1]).toEqualBuffer(Buffer.from('30', 'hex'))
      expect(transactionHashes[2]).toEqualBuffer(Buffer.from('300', 'hex'))
      expect(transactionHashes[3]).toEqualBuffer(Buffer.from('3000', 'hex'))
    })
  })

  describe('loadPendingTransactionHashes', () => {
    it('loads transaction hashes with expiration sequences outside the expired range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      // expiration of 0 never expires
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [0, Buffer.from('0', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [4, Buffer.from('4', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [40, Buffer.from('40', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [400, Buffer.from('400', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [4000, Buffer.from('4000', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [40000, Buffer.from('40000', 'hex')]],
        null,
      )

      const transactionHashes = await AsyncUtils.materialize(
        walletDb.loadPendingTransactionHashes(account, 4000),
      )

      expect(transactionHashes).toHaveLength(2)
      expect(transactionHashes[0]).toEqualBuffer(Buffer.from('0', 'hex'))
      expect(transactionHashes[1]).toEqualBuffer(Buffer.from('40000', 'hex'))
    })
  })
})
