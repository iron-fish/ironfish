/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import '../testUtilities/matchers/blockchain'
import { Assert } from '../assert'
import { BlockHeader } from '../primitives'
import { Target } from '../primitives/target'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { VerificationResultReason } from './verifier'

describe('Verifier', () => {
  describe('Transaction', () => {
    const nodeTest = createNodeTest()

    it('rejects if the transaction cannot be deserialized', () => {
      expect(() =>
        nodeTest.chain.verifier.verifyNewTransaction(Buffer.alloc(32, 'hello')),
      ).toThrowError('Transaction cannot deserialize')

      expect(() =>
        nodeTest.chain.verifier.verifyNewTransaction(
          Buffer.from(JSON.stringify({ not: 'valid' })),
        ),
      ).toThrowError('Transaction cannot deserialize')
    })

    it('extracts a valid transaction', async () => {
      const { transaction: tx } = await useTxSpendsFixture(nodeTest.node)
      const serialized = tx.serialize()

      const transaction = nodeTest.chain.verifier.verifyNewTransaction(serialized)

      expect(tx.equals(transaction)).toBe(true)
    }, 60000)
  })

  describe('Block', () => {
    const nodeTest = createNodeTest()

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

      jest.spyOn(nodeTest.verifier['workerPool'], 'verifyTransactions').mockResolvedValue({
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
        reason: VerificationResultReason.MINERS_FEE_MISMATCH,
        valid: false,
      })
    })

    it("rejects a block with standard (non-miner's) transaction fee as first transaction", async () => {
      const { block } = await useBlockWithTx(nodeTest.node)
      block.transactions = [block.transactions[1], block.transactions[0]]
      expect(block.transactions[0].fee()).toBeGreaterThan(0)

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.MINERS_FEE_EXPECTED,
        valid: false,
      })
    })

    it('rejects a block with miners fee as second transaction', async () => {
      const { block } = await useBlockWithTx(nodeTest.node)
      block.transactions[1] = block.transactions[0]

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_TRANSACTION_FEE,
        valid: false,
      })
    })

    it('rejects block with incorrect fee sum', async () => {
      const { block } = await useBlockWithTx(nodeTest.node)
      block.transactions[2] = block.transactions[1]

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
    let header: BlockHeader

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

  describe('verifyConnectedSpends', () => {
    const nodeTest = createNodeTest()

    it('says the block with no spends is valid', async () => {
      const { chain, strategy } = nodeTest
      strategy.disableMiningReward()
      const block = await makeBlockAfter(chain, chain.head)
      expect((await chain.verifier.verifyConnectedSpends(block)).valid).toBe(true)
    })

    it('says the block with spends is valid', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockWithTx(nodeTest.node)
      expect((await chain.verifier.verifyConnectedSpends(block)).valid).toBe(true)
      expect(Array.from(block.spends())).toHaveLength(1)
    }, 60000)

    it('is invalid with DOUBLE_SPEND as the reason', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockWithTx(nodeTest.node)

      const spends = Array.from(block.spends())
      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        for (const spend of spends) {
          yield spend
          yield spend
        }
      })

      expect(await chain.verifier.verifyConnectedSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.DOUBLE_SPEND,
      })
    }, 60000)

    it('is invalid with ERROR as the reason', async () => {
      const { block } = await useBlockWithTx(nodeTest.node)

      const spends = Array.from(block.spends())
      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        for (const spend of spends) {
          yield spend
        }
      })

      jest
        .spyOn(nodeTest.chain.notes, 'getCount')
        .mockImplementationOnce(() => Promise.resolve(0))

      expect(await nodeTest.verifier.verifyConnectedSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.ERROR,
      })
    }, 60000)

    it('a block that spends a note in a previous block is invalid with INVALID_SPEND as the reason', async () => {
      const { chain } = nodeTest
      const { block, previous } = await useBlockWithTx(nodeTest.node)

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

      expect(await chain.verifier.verifyConnectedSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.INVALID_SPEND,
      })
    }, 60000)

    it('a block that spends a note never in the tree is invalid with INVALID_SPEND as the reason', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockWithTx(nodeTest.node)

      const nullifier = Buffer.alloc(32)
      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        yield { nullifier, commitment: Buffer.from('noooo'), size: 1 }
      })

      expect(await chain.verifier.verifyConnectedSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.INVALID_SPEND,
      })
    }, 60000)
  })

  describe('validAgainstPrevious', () => {
    const nodeTest = createNodeTest()

    it('is valid', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)

      expect(
        nodeTest.verifier.isValidAgainstPrevious(block, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: true,
      })
    }, 30000)

    it('is invalid when the target is wrong', async () => {
      nodeTest.verifier.enableVerifyTarget = true
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.target = Target.minTarget()

      expect(
        nodeTest.verifier.isValidAgainstPrevious(block, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.INVALID_TARGET,
      })
    }, 30000)

    it("is invalid when the note commitments aren't the same size", async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.noteCommitment.size = 1000

      expect(
        nodeTest.verifier.isValidAgainstPrevious(block, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.NOTE_COMMITMENT_SIZE,
      })
    }, 30000)

    it("is invalid when the nullifier commitments aren't the same size", async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.nullifierCommitment.size = 1000

      expect(
        nodeTest.verifier.isValidAgainstPrevious(block, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.NULLIFIER_COMMITMENT_SIZE,
      })
    }, 30000)

    it('Is invalid when the timestamp is in past', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.timestamp = new Date(0)

      expect(
        nodeTest.verifier.isValidAgainstPrevious(block, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.BLOCK_TOO_OLD,
      })
    }, 30000)

    it('Is invalid when the sequence is wrong', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.sequence = 9999

      expect(
        nodeTest.verifier.isValidAgainstPrevious(block, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.SEQUENCE_OUT_OF_ORDER,
      })
    }, 30000)
  })

  describe('blockMatchesTree', () => {
    const nodeTest = createNodeTest()

    it('is true for block that passes all checks', async () => {
      const genesisBlock = await nodeTest.chain.getBlock(nodeTest.chain.genesis)
      Assert.isNotNull(genesisBlock)

      await expect(nodeTest.verifier.verifyConnectedBlock(genesisBlock)).resolves.toMatchObject(
        {
          valid: true,
        },
      )
    })

    it("is false if there aren't enough notes in the tree", async () => {
      await nodeTest.chain.notes.truncate((await nodeTest.chain.notes.size()) - 1)

      const genesisBlock = await nodeTest.chain.getBlock(nodeTest.chain.genesis)
      Assert.isNotNull(genesisBlock)

      await expect(nodeTest.verifier.verifyConnectedBlock(genesisBlock)).resolves.toMatchObject(
        {
          valid: false,
          reason: VerificationResultReason.NOTE_COMMITMENT_SIZE,
        },
      )
    })

    it("is false if there aren't enough nullifiers in the tree", async () => {
      await nodeTest.chain.nullifiers.truncate((await nodeTest.chain.nullifiers.size()) - 1)

      const genesisBlock = await nodeTest.chain.getBlock(nodeTest.chain.genesis)
      Assert.isNotNull(genesisBlock)

      await expect(nodeTest.verifier.verifyConnectedBlock(genesisBlock)).resolves.toMatchObject(
        {
          valid: false,
          reason: VerificationResultReason.NULLIFIER_COMMITMENT_SIZE,
        },
      )
    })

    it('is false if the note hash is incorrect', async () => {
      nodeTest.chain.genesis.noteCommitment.commitment = Buffer.alloc(
        nodeTest.chain.genesis.noteCommitment.commitment.length,
        'NOOO',
      )

      const genesisBlock = await nodeTest.chain.getBlock(nodeTest.chain.genesis)
      Assert.isNotNull(genesisBlock)

      await expect(nodeTest.verifier.verifyConnectedBlock(genesisBlock)).resolves.toMatchObject(
        {
          valid: false,
          reason: VerificationResultReason.NOTE_COMMITMENT,
        },
      )
    })

    it('is false for block that has incorrect nullifier hash', async () => {
      nodeTest.chain.genesis.nullifierCommitment.commitment = Buffer.alloc(
        nodeTest.chain.genesis.nullifierCommitment.commitment.length,
        'NOOO',
      )

      const genesisBlock = await nodeTest.chain.getBlock(nodeTest.chain.genesis)
      Assert.isNotNull(genesisBlock)

      await expect(nodeTest.verifier.verifyConnectedBlock(genesisBlock)).resolves.toMatchObject(
        {
          valid: false,
          reason: VerificationResultReason.NULLIFIER_COMMITMENT,
        },
      )
    })

    it('returns any error from verifyConnectedSpends()', async () => {
      const genesisBlock = await nodeTest.chain.getBlock(nodeTest.chain.genesis)
      Assert.isNotNull(genesisBlock)

      jest
        .spyOn(nodeTest.verifier, 'verifySpend')
        .mockResolvedValue(VerificationResultReason.ERROR)

      await expect(nodeTest.verifier.verifyConnectedBlock(genesisBlock)).resolves.toMatchObject(
        {
          valid: false,
          reason: VerificationResultReason.ERROR,
        },
      )
    })
  })

  describe('verifyTransactionContextual', () => {
    const nodeTest = createNodeTest()

    describe('with an invalid expiration sequence', () => {
      it('returns TRANSACTION_EXPIRED', async () => {
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        jest.spyOn(transaction, 'expirationSequence').mockImplementationOnce(() => 1)

        expect(
          await nodeTest.verifier.verifyTransactionContextual(transaction, nodeTest.chain.head),
        ).toEqual({
          valid: false,
          reason: VerificationResultReason.TRANSACTION_EXPIRED,
        })
      }, 60000)
    })

    describe('when the worker pool returns false', () => {
      it('returns ERROR', async () => {
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        jest.spyOn(nodeTest.workerPool, 'verify').mockImplementationOnce(() =>
          Promise.resolve({
            valid: false,
            reason: VerificationResultReason.ERROR,
          }),
        )

        await expect(
          nodeTest.verifier.verifyTransactionContextual(transaction, nodeTest.chain.head),
        ).resolves.toEqual({
          valid: false,
          reason: VerificationResultReason.ERROR,
        })
      }, 60000)
    })

    describe('when the worker pool returns true', () => {
      it('returns valid', async () => {
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        jest.spyOn(nodeTest.workerPool, 'verify').mockImplementationOnce(() =>
          Promise.resolve({
            valid: true,
          }),
        )

        expect(
          await nodeTest.verifier.verifyTransactionContextual(transaction, nodeTest.chain.head),
        ).toEqual({
          valid: true,
        })
      }, 60000)
    })

    describe('when verify() throws an error', () => {
      it('returns VERIFY_TRANSACTION', async () => {
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        jest.spyOn(nodeTest.workerPool, 'verify').mockImplementation(() => {
          throw new Error('Response type must match request type')
        })

        await expect(
          nodeTest.verifier.verifyTransactionContextual(transaction, nodeTest.chain.head),
        ).resolves.toEqual({
          valid: false,
          reason: VerificationResultReason.VERIFY_TRANSACTION,
        })
      }, 60000)
    })
  })
})
