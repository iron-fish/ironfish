/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')
jest.mock('../network')

import { RangeHasher } from '../merkletree'
import {
  TestStrategy,
  makeFakeBlock,
  blockHash,
  TestBlockHeader,
  fakeMaxTarget,
  TestBlockchain,
  makeChainFull,
} from '../testUtilities/fake'
import { Validity, VerificationResultReason } from './verifier'
import { Target } from '../primitives/target'
import { BlockHeader } from '../primitives/blockheader'
import { WorkerPool } from '../workerPool'

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

      const {
        block: newBlock,
        serializedBlock: newSerializedBlock,
      } = await chain.verifier.verifyNewBlock(serializedBlock, new WorkerPool())

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
      expect(verification.valid).toBe(Validity.Yes)
    })

    it("doesn't validate a block with an invalid header", async () => {
      const block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
      block.header.target = new Target(0)

      expect(await chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.HASH_NOT_MEET_TARGET,
        valid: 0,
      })
    })

    it("doesn't validate a block with an invalid transaction", async () => {
      const block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
      block.transactions[1].isValid = false

      expect(await chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_TRANSACTION_PROOF,
        valid: 0,
      })
    })

    it("doesn't validate a block with incorrect transaction fee", async () => {
      const block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
      block.header.minersFee = BigInt(-1)

      expect(await chain.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_MINERS_FEE,
        valid: 0,
      })
    })
  })

  describe('BlockHeader', () => {
    const strategy = new TestStrategy(new RangeHasher())
    let dateSpy: jest.SpyInstance<number, []>
    let chain: TestBlockchain
    let header: TestBlockHeader

    beforeAll(() => {
      dateSpy = jest.spyOn(global.Date, 'now').mockImplementation(() => 1598467858637)
    })

    beforeEach(async () => {
      dateSpy.mockClear()
      chain = await makeChainFull(strategy)

      header = new BlockHeader(
        strategy,
        BigInt(5),
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
      expect(chain.verifier.verifyBlockHeader(header).valid).toBe(Validity.Yes)
    })

    it('fails validation when target is invalid', () => {
      header.target = new Target(BigInt(0))

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.HASH_NOT_MEET_TARGET,
        valid: 0,
      })
    })

    it('fails validation when timestamp is in future', () => {
      header.timestamp = new Date(1598467898637)

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.TOO_FAR_IN_FUTURE,
        valid: 0,
      })
    })

    it('fails validation if graffiti field is not equal to 32 bytes', () => {
      header.graffiti = Buffer.alloc(31)
      header.graffiti.write('test')

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.GRAFFITI,
        valid: 0,
      })

      header.graffiti = Buffer.alloc(33)
      header.graffiti.write('test2')

      expect(chain.verifier.verifyBlockHeader(header)).toMatchObject({
        reason: VerificationResultReason.GRAFFITI,
        valid: 0,
      })
    })
  })
})
