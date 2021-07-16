/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')
jest.mock('../network')

import '../testUtilities/matchers/blockchain'
import { IronfishBlockHeader } from '../primitives/blockheader'
import {
  createNodeTest,
  useAccountFixture,
  useBlockTxFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { WorkerPool } from '../workerPool'
import { VerificationResultReason } from './verifier'

describe('Verifier', () => {
  describe('Transaction', () => {
    const nodeTest = createNodeTest()

    it('rejects if payload is not a serialized transaction', async () => {
      await expect(
        nodeTest.chain.verifier.verifyNewTransaction({ notA: 'Transaction' }),
      ).rejects.toThrowError('Payload is not a serialized transaction')
    })

    it('rejects if the transaction cannot be deserialized', async () => {
      await expect(
        nodeTest.chain.verifier.verifyNewTransaction({
          transaction: Buffer.alloc(32, 'hello'),
        }),
      ).rejects.toThrowError('Transaction cannot deserialize')

      await expect(
        nodeTest.chain.verifier.verifyNewTransaction({
          transaction: { not: 'valid' },
        }),
      ).rejects.toThrowError('Transaction cannot deserialize')
    })

    it('extracts a valid transaction', async () => {
      const { transaction: tx } = await useTxSpendsFixture(nodeTest.node)
      const serialized = nodeTest.strategy.transactionSerde().serialize(tx)

      const { transaction, serializedTransaction } =
        await nodeTest.chain.verifier.verifyNewTransaction({
          transaction: serialized,
        })

      expect(tx.equals(transaction)).toBe(true)
      expect(serialized.equals(serializedTransaction)).toBe(true)
    }, 60000)

    it('rejects if the transaction is not valid', async () => {
      const { transaction } = await useTxSpendsFixture(nodeTest.node)
      const serialized = nodeTest.strategy.transactionSerde().serialize(transaction)

      jest.spyOn(nodeTest.chain.verifier, 'verifyTransaction').mockResolvedValue({
        valid: false,
        reason: VerificationResultReason.VERIFY_TRANSACTION,
      })

      await expect(
        nodeTest.chain.verifier.verifyNewTransaction({ transaction: serialized }),
      ).rejects.toThrowError('Transaction is invalid')
    }, 60000)

    it('rejects if the transaction has negative fees', async () => {
      const account = await useAccountFixture(nodeTest.accounts)
      const tx = await useMinersTxFixture(nodeTest.accounts, account, 2, -100)
      const serialized = nodeTest.strategy.transactionSerde().serialize(tx)

      await expect(
        nodeTest.chain.verifier.verifyNewTransaction({ transaction: serialized }),
      ).rejects.toThrowError('Transaction has negative fees')
    }, 30000)
  })

  describe('Block', () => {
    const nodeTest = createNodeTest()

    it('extracts a valid block', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      const serialized = nodeTest.strategy.blockSerde.serialize(block)

      const result = await nodeTest.node.chain.verifier.verifyNewBlock(
        serialized,
        nodeTest.node.workerPool,
      )

      expect(result.block.header.hash.equals(block.header.hash)).toBe(true)

      expect(result.serializedBlock.header.previousBlockHash).toEqual(
        serialized.header.previousBlockHash,
      )
    })

    it('rejects a invalid network block', async () => {
      // should have invalid target
      nodeTest.verifier.enableVerifyTarget = true

      const block = await useMinerBlockFixture(nodeTest.chain)
      const serializedBlock = nodeTest.chain.strategy.blockSerde.serialize(block)

      await expect(
        nodeTest.chain.verifier.verifyNewBlock(serializedBlock, new WorkerPool()),
      ).rejects.toEqual('Block is invalid')
    })

    it('rejects a block with an invalid header', async () => {
      // should have invalid target
      nodeTest.verifier.enableVerifyTarget = true

      const block = await useMinerBlockFixture(nodeTest.chain)

      expect(await nodeTest.chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.HASH_NOT_MEET_TARGET,
        valid: false,
      })
    })

    it('rejects a block with an invalid transaction', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)

      jest.spyOn(nodeTest.verifier, 'verifyTransaction').mockResolvedValue({
        valid: false,
        reason: VerificationResultReason.VERIFY_TRANSACTION,
      })

      expect(await nodeTest.chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.VERIFY_TRANSACTION,
        valid: false,
      })
    })

    it('rejects a block with incorrect transaction fee', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.minersFee = BigInt(-1)

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_MINERS_FEE,
        valid: false,
      })
    })

    it('accepts a valid block', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      const verification = await nodeTest.chain.verifier.verifyBlock(block)
      expect(verification.valid).toBe(true)
    })
  })

  describe('BlockHeader', () => {
    const nodeTest = createNodeTest()
    let header: IronfishBlockHeader

    beforeEach(async () => {
      header = (await useMinerBlockFixture(nodeTest.chain)).header
    })

    it('validates a valid transaction', () => {
      expect(nodeTest.verifier.verifyBlockHeader(header).valid).toBe(true)
    })

    it('fails validation when target is invalid', () => {
      nodeTest.verifier.enableVerifyTarget = true

      expect(nodeTest.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.HASH_NOT_MEET_TARGET,
        valid: false,
      })
    })

    it('fails validation when timestamp is in future', () => {
      jest.spyOn(global.Date, 'now').mockImplementationOnce(() => 1598467858637)
      header.timestamp = new Date(1598467898637)

      expect(nodeTest.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.TOO_FAR_IN_FUTURE,
        valid: false,
      })
    })

    it('fails validation if graffiti field is not equal to 32 bytes', () => {
      header.graffiti = Buffer.alloc(31)

      expect(nodeTest.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.GRAFFITI,
        valid: false,
      })

      header.graffiti = Buffer.alloc(33)

      expect(nodeTest.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.GRAFFITI,
        valid: false,
      })
    })
  })

  describe('hasValidSpends', () => {
    const nodeTest = createNodeTest()

    it('says the block with no spends is valid', async () => {
      const { chain, strategy } = nodeTest
      strategy.disableMiningReward()
      const block = await makeBlockAfter(chain, chain.head)
      expect((await chain.verifier.hasValidSpends(block)).valid).toBe(true)
    })

    it('says the block with spends is valid', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockTxFixture(nodeTest.node)
      expect((await chain.verifier.hasValidSpends(block)).valid).toBe(true)
      expect(Array.from(block.spends())).toHaveLength(1)
    }, 60000)

    it('is invalid with DOUBLE_SPEND as the reason', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockTxFixture(nodeTest.node)

      const spends = Array.from(block.spends())
      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        for (const spend of spends) {
          yield spend
          yield spend
        }
      })

      expect(await chain.verifier.hasValidSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.DOUBLE_SPEND,
      })
    }, 60000)

    it('is invalid with ERROR as the reason', async () => {
      const { block } = await useBlockTxFixture(nodeTest.node)

      const spends = Array.from(block.spends())
      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        for (const spend of spends) {
          yield spend
        }
      })

      jest
        .spyOn(nodeTest.chain.notes, 'getCount')
        .mockImplementationOnce(() => Promise.resolve(0))

      expect(await nodeTest.verifier.hasValidSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.ERROR,
      })
    }, 60000)

    it('a block that spends a note in a previous block is invalid with INVALID_SPEND as the reason', async () => {
      const { chain } = nodeTest
      const { block, previous } = await useBlockTxFixture(nodeTest.node)

      const nullifier = Buffer.alloc(32)

      await chain.nullifiers.add(nullifier)
      previous.header.nullifierCommitment.commitment = await chain.nullifiers.rootHash()
      previous.header.nullifierCommitment.size = 2

      await chain.nullifiers.add(nullifier)
      block.header.nullifierCommitment.commitment = await chain.nullifiers.rootHash()
      block.header.nullifierCommitment.size = 3

      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        yield { nullifier, commitment: Buffer.from('1-1'), size: 1 }
        yield { nullifier, commitment: Buffer.from('1-1'), size: 1 }
      })

      expect(await chain.verifier.hasValidSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.INVALID_SPEND,
      })
    }, 60000)

    it('a block that spends a note never in the tree is invalid with INVALID_SPEND as the reason', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockTxFixture(nodeTest.node)

      const nullifier = Buffer.alloc(32)
      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        yield { nullifier, commitment: Buffer.from('noooo'), size: 1 }
      })

      expect(await chain.verifier.hasValidSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.INVALID_SPEND,
      })
    }, 60000)
  })
})
