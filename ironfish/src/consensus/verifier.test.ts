/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')
jest.mock('../network')

import { generateKey } from 'ironfish-wasm-nodejs'
import { RangeHasher } from '../merkletree'
import { BlockHeader } from '../primitives/blockheader'
import { Target } from '../primitives/target'
import {
  createNodeTest,
  useAccountFixture,
  useBlockFixture,
  useMinerBlockFixture,
} from '../testUtilities'
import {
  blockHash,
  fakeMaxTarget,
  makeChainFull,
  makeFakeBlock,
  TestBlockchain,
  TestBlockHeader,
  TestStrategy,
} from '../testUtilities/fake'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { WorkerPool } from '../workerPool'
import { VerificationResultReason } from './verifier'

describe('Verifier', () => {
  describe('Transactions', () => {
    const strategy = new TestStrategy(new RangeHasher())
    let chain: TestBlockchain

    beforeEach(async () => {
      chain = await makeChainFull(strategy)
    })

    it('constructs a verifier', () => {
      expect(chain.verifier).toBeDefined()
    })

    it('extracts a valid transaction', async () => {
      const newTransactionPayload = {
        transaction: { elements: ['a'], spends: [], totalFees: 5, isValid: true },
      }

      const result = await chain.verifier.verifyNewTransaction(newTransactionPayload)

      const { transaction, serializedTransaction } = result

      expect(transaction).toMatchObject({
        _spends: [],
        elements: ['a'],
        isValid: true,
        totalFees: BigInt(5),
      })

      expect(serializedTransaction).toMatchObject({
        spends: [],
        elements: ['a'],
        isValid: true,
        totalFees: 5,
      })
    })

    it('rejects if payload is not a serialized transaction', async () => {
      await expect(
        chain.verifier.verifyNewTransaction({ notA: 'Transaction' }),
      ).rejects.toEqual('Payload is not a serialized transaction')
    })

    it('rejects if the transaction cannot be deserialized', async () => {
      await expect(
        chain.verifier.verifyNewTransaction({ transaction: { not: 'valid' } }),
      ).rejects.toEqual('Could not deserialize transaction')
    })

    it('rejects if the transaction is not valid', async () => {
      const newTransactionPayload = {
        transaction: { elements: ['a'], spends: [], totalFees: 5, isValid: false },
      }
      await expect(chain.verifier.verifyNewTransaction(newTransactionPayload)).rejects.toEqual(
        'Transaction is invalid',
      )
    })

    it('rejects if the transaction has negative fees', async () => {
      const newTransactionPayload = {
        transaction: { elements: ['a'], spends: [], totalFees: -5, isValid: true },
      }

      await expect(chain.verifier.verifyNewTransaction(newTransactionPayload)).rejects.toEqual(
        'Transaction has negative fees',
      )
    })
  })

  describe('Block', () => {
    const strategy = new TestStrategy(new RangeHasher())
    let chain: TestBlockchain
    let targetSpy: jest.SpyInstance

    beforeEach(async () => {
      targetSpy = jest.spyOn(Target, 'minDifficulty').mockImplementation(() => BigInt(1))
      chain = await makeChainFull(strategy)
    })

    afterAll(() => {
      targetSpy.mockClear()
    })

    it('extracts a valid block', async () => {
      const block = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 5, 6)
      const serializedBlock = chain.strategy.blockSerde.serialize(block)

      const { block: newBlock, serializedBlock: newSerializedBlock } =
        await chain.verifier.verifyNewBlock(serializedBlock, new WorkerPool())

      expect(newBlock.header.hash.equals(block.header.hash)).toBe(true)
      expect(newSerializedBlock.header.previousBlockHash).toEqual(
        serializedBlock.header.previousBlockHash,
      )
    })

    it('rejects if the block is not valid', async () => {
      const block = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 5, 6)
      block.transactions[0].isValid = false
      const serializedBlock = chain.strategy.blockSerde.serialize(block)

      await expect(
        chain.verifier.verifyNewBlock(serializedBlock, new WorkerPool()),
      ).rejects.toEqual('Block is invalid')
    })

    it('validates a valid block', async () => {
      const block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
      const verification = await chain.verifier.verifyBlock(block)
      expect(verification.valid).toBe(true)
    })

    it("doesn't validate a block with an invalid header", async () => {
      const block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
      block.header.target = new Target(0)

      expect(await chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.HASH_NOT_MEET_TARGET,
        valid: false,
      })
    })

    it("doesn't validate a block with an invalid transaction", async () => {
      const block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
      block.transactions[1].isValid = false

      expect(await chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_TRANSACTION_PROOF,
        valid: false,
      })
    })

    it("doesn't validate a block with incorrect transaction fee", async () => {
      const block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
      block.header.minersFee = BigInt(-1)

      expect(await chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_MINERS_FEE,
        valid: false,
      })
    })
  })

  describe('BlockHeader', () => {
    const strategy = new TestStrategy(new RangeHasher())
    let chain: TestBlockchain
    let header: TestBlockHeader

    beforeEach(async () => {
      chain = await makeChainFull(strategy, { autoSeed: false })

      header = new BlockHeader(
        strategy,
        5,
        Buffer.alloc(32),
        { commitment: 'header', size: 8 },
        { commitment: Buffer.alloc(32), size: 3 },
        fakeMaxTarget(),
        25,
        new Date(1598467858637),
        BigInt(0),
        Buffer.alloc(32),
      )
    })

    it('validates a valid transaction', () => {
      expect(chain.verifier.verifyBlockHeader(header).valid).toBe(true)
    })

    it('fails validation when target is invalid', () => {
      header.target = new Target(BigInt(0))

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.HASH_NOT_MEET_TARGET,
        valid: false,
      })
    })

    it('fails validation when timestamp is in future', () => {
      jest.spyOn(global.Date, 'now').mockImplementationOnce(() => 1598467858637)
      header.timestamp = new Date(1598467898637)

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.TOO_FAR_IN_FUTURE,
        valid: false,
      })
    })

    it('fails validation if graffiti field is not equal to 32 bytes', () => {
      header.graffiti = Buffer.alloc(31)
      header.graffiti.write('test')

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.GRAFFITI,
        valid: false,
      })

      header.graffiti = Buffer.alloc(33)
      header.graffiti.write('test2')

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.GRAFFITI,
        valid: false,
      })
    })
  })

  describe('hasValidSpends', () => {
    const nodeTest = createNodeTest()
    const performBlockSetup = async () => {
      const { chain, node } = nodeTest

      const account = await useAccountFixture(node.accounts, () =>
        node.accounts.createAccount('test'),
      )

      const block1 = await useMinerBlockFixture(node.chain, 2, account)
      await node.chain.addBlock(block1)
      await node.accounts.updateHead()

      const block2 = await useBlockFixture(chain, async () => {
        const transaction = await node.accounts.createTransaction(
          account,
          BigInt(1),
          BigInt(1),
          '',
          account.publicAddress,
        )

        return node.chain.newBlock(
          [transaction],
          await node.strategy.createMinersFee(
            await transaction.transactionFee(),
            3,
            generateKey().spending_key,
          ),
        )
      })

      return { block1, block2 }
    }

    describe('a block with no spends', () => {
      it('says the block is valid', async () => {
        const { chain, strategy } = nodeTest
        strategy.disableMiningReward()
        const block = await makeBlockAfter(chain, chain.head)
        expect((await chain.verifier.hasValidSpends(block)).valid).toBe(true)
      })
    })

    describe('a block with valid spends', () => {
      it('says the block is valid', async () => {
        const { chain } = nodeTest
        const { block2 } = await performBlockSetup()
        expect((await chain.verifier.hasValidSpends(block2)).valid).toBe(true)
        expect(Array.from(block2.spends())).toHaveLength(1)
      }, 60000)
    })

    describe('a block with double spends', () => {
      it('is invalid with DOUBLE_SPEND as the reason', async () => {
        const { chain } = nodeTest
        const { block2 } = await performBlockSetup()

        const spends = Array.from(block2.spends())
        jest.spyOn(block2, 'spends').mockImplementationOnce(function* () {
          for (const spend of spends) {
            yield spend
            yield spend
          }
        })

        expect(await chain.verifier.hasValidSpends(block2)).toEqual({
          valid: false,
          reason: VerificationResultReason.DOUBLE_SPEND,
        })
      }, 60000)
    })

    describe('a block that throws an error when verifying a spend', () => {
      it('is invalid with ERROR as the reason', async () => {
        const { chain } = nodeTest
        const { block2 } = await performBlockSetup()

        const spends = Array.from(block2.spends())
        jest.spyOn(block2, 'spends').mockImplementationOnce(function* () {
          for (const spend of spends) {
            yield spend
          }
        })
        jest.spyOn(chain.notes, 'getCount').mockImplementationOnce(() => Promise.resolve(0))

        expect(await chain.verifier.hasValidSpends(block2)).toEqual({
          valid: false,
          reason: VerificationResultReason.ERROR,
        })
      }, 60000)
    })

    describe('a block that spends a note in a previous block', () => {
      it('is invalid with INVALID_SPEND as the reason', async () => {
        const { chain } = nodeTest
        const { block1, block2 } = await performBlockSetup()

        const nullifier = Buffer.alloc(32)
        await chain.nullifiers.add(nullifier)
        block1.header.nullifierCommitment.commitment = await chain.nullifiers.rootHash()
        block1.header.nullifierCommitment.size = 2
        await chain.nullifiers.add(nullifier)
        block2.header.nullifierCommitment.commitment = await chain.nullifiers.rootHash()
        block2.header.nullifierCommitment.size = 3
        jest.spyOn(block2, 'spends').mockImplementationOnce(function* () {
          yield { nullifier, commitment: Buffer.from('1-1'), size: 1 }
          yield { nullifier, commitment: Buffer.from('1-1'), size: 1 }
        })

        expect(await chain.verifier.hasValidSpends(block2)).toEqual({
          valid: false,
          reason: VerificationResultReason.INVALID_SPEND,
        })
      }, 60000)
    })

    describe('a block that spends a note never in the tree', () => {
      it('is invalid with INVALID_SPEND as the reason', async () => {
        const { chain } = nodeTest
        const { block2 } = await performBlockSetup()

        const nullifier = Buffer.alloc(32)
        jest.spyOn(block2, 'spends').mockImplementationOnce(function* () {
          yield { nullifier, commitment: Buffer.from('noooo'), size: 1 }
        })

        expect(await chain.verifier.hasValidSpends(block2)).toEqual({
          valid: false,
          reason: VerificationResultReason.INVALID_SPEND,
        })
      }, 60000)
    })
  })
})
