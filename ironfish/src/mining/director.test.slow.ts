/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VerificationResultReason } from '../consensus'
import { waitForEmit } from '../event'
import { Target } from '../primitives/target'
import PartialBlockHeaderSerde from '../serde/PartialHeaderSerde'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useTxFixture,
} from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { flushTimeout } from '../testUtilities/helpers/tests'
import { isTransactionMine } from '../testUtilities/helpers/transaction'
import { MINED_RESULT } from './director'

describe('Mining director', () => {
  const nodeTest = createNodeTest()

  beforeEach(async () => {
    await nodeTest.node.miningDirector.start()
  })

  afterEach(() => {
    nodeTest.node.miningDirector.shutdown()
  })

  describe('Before mining', () => {
    it('creates a new block to be mined when chain head changes', async () => {
      const { chain, miningDirector } = nodeTest.node
      miningDirector.force = true

      const generateBlockSpy = jest
        .spyOn(miningDirector, 'generateBlockToMine')
        .mockReturnValue(Promise.resolve())

      const previous = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(previous)
      await flushTimeout()

      expect(generateBlockSpy).toBeCalledTimes(1)
      expect(generateBlockSpy.mock.calls[0][0].equals(previous.header.hash)).toBe(true)
    }, 10000)

    it('creates block and starts mining', async () => {
      const { chain, accounts, miningDirector } = nodeTest.node

      const account = await accounts.createAccount('')
      miningDirector.setMinerAccount(account)

      const spy = jest
        .spyOn(miningDirector, 'constructAndMineBlockWithRetry')
        .mockReturnValue(Promise.resolve())

      await miningDirector.generateBlockToMine(chain.head.hash)

      expect(spy).toBeCalledTimes(1)
      const [minersFee, transactions] = spy.mock.calls[0]
      expect(transactions).toHaveLength(0)
      expect(isTransactionMine(minersFee, account)).toBe(true)
    }, 10000)

    it('adds transactions from the mempool', async () => {
      const { node, miningDirector, chain } = nodeTest

      const account = await useAccountFixture(node.accounts, 'a')
      miningDirector.setMinerAccount(account)
      miningDirector.force = true

      const previous = await useMinerBlockFixture(chain, 2, account, node.accounts)
      await expect(chain).toAddBlock(previous)
      await node.accounts.updateHead()

      const transaction = await useTxFixture(node.accounts, account, account)

      expect(node.memPool.size()).toBe(0)
      await miningDirector.memPool.acceptTransaction(transaction)
      expect(node.memPool.size()).toBe(1)

      const spy = jest
        .spyOn(miningDirector, 'constructAndMineBlockWithRetry')
        .mockReturnValue(Promise.resolve())

      await miningDirector.generateBlockToMine(chain.head.hash)

      expect(spy).toBeCalledTimes(1)
      const transactions = spy.mock.calls[0][1]
      expect(transactions).toHaveLength(1)
      expect(isTransactionMine(transactions[0], account)).toBe(true)
      expect(node.memPool.size()).toBe(1)
    }, 25000)

    it('should emit block to be mined', async () => {
      // This test is testing the partially constructed
      // block that's created to be mined is reasonably
      // correct when emitted from MiningDirector.onBlockToMine
      const { chain, miningDirector, accounts } = nodeTest.node
      const account = await accounts.createAccount('')
      nodeTest.strategy.disableMiningReward()
      miningDirector.force = true
      miningDirector.setBlockGraffiti('testing')
      miningDirector.setMinerAccount(account)

      const now = Date.now()

      // Freeze time so we can predict the target
      jest.spyOn(global.Date, 'now').mockReturnValue(now)
      jest.spyOn(miningDirector.onBlockToMine, 'emit')

      const promise = waitForEmit(miningDirector.onBlockToMine)
      const previous = await makeBlockAfter(chain, chain.head)

      await expect(chain).toAddBlock(previous)
      const [event] = await promise

      const partial = new PartialBlockHeaderSerde(chain.strategy).deserialize(event.bytes)

      expect(event.target.targetValue).toEqual(
        Target.calculateTarget(new Date(now), previous.header.timestamp, previous.header.target)
          .targetValue,
      )

      expect(partial.previousBlockHash.equals(previous.header.hash)).toBe(true)
      expect(partial.minersFee).toEqual(BigInt(0))
      expect(partial.timestamp.valueOf()).toEqual(now)
    }, 15000)
  })

  describe('During Mining', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setTimeout(15000000)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should recalculate block after interval', async () => {
      const { node, miningDirector } = nodeTest
      const account = await useAccountFixture(node.accounts, 'a')
      const tx = await useMinersTxFixture(nodeTest.node.accounts, account)

      const spy = jest.spyOn(miningDirector, 'constructAndMineBlock').mockResolvedValue(false)
      expect(spy).toBeCalledTimes(0)

      await miningDirector.constructAndMineBlockWithRetry(tx, [])
      expect(spy).toBeCalledTimes(1)

      // Should not retry
      jest.advanceTimersByTime(11000)
      expect(spy).toBeCalledTimes(1)

      spy.mockResolvedValue(true)
      await miningDirector.constructAndMineBlockWithRetry(tx, [])
      expect(spy).toBeCalledTimes(2)

      // should retry now
      jest.advanceTimersByTime(11000)
      expect(spy).toBeCalledTimes(3)
    })

    it('retries calculating target if target is not at max', async () => {
      const { node, miningDirector } = nodeTest
      const account = await useAccountFixture(node.accounts, 'a')
      const tx = await useMinersTxFixture(nodeTest.node.accounts, account)

      const targetSpy = jest.spyOn(Target, 'calculateTarget')

      targetSpy.mockReturnValueOnce(Target.maxTarget())
      await expect(miningDirector.constructAndMineBlock(tx, [])).resolves.toBe(false)

      targetSpy.mockReturnValueOnce(
        Target.fromDifficulty(Target.minDifficulty() + BigInt(10000000000)),
      )
      await expect(miningDirector.constructAndMineBlock(tx, [])).resolves.toBe(true)
    })
  })

  describe('After mining', () => {
    it('discards block if not in recentBlocks', async () => {
      const { miningDirector } = nodeTest

      await expect(miningDirector.successfullyMined(0, 0)).resolves.toBe(
        MINED_RESULT.UNKNOWN_REQUEST,
      )
    })

    it('discards block if chain changed', async () => {
      const { strategy, chain, node, miningDirector } = nodeTest
      strategy.disableMiningReward()

      const blockA1 = await makeBlockAfter(chain, chain.genesis)
      const blockA2 = await makeBlockAfter(chain, chain.genesis)

      node.miningDirector.recentBlocks.set(2, blockA1)
      node.miningDirector.recentBlocks.set(3, blockA2)

      await expect(miningDirector.successfullyMined(1, 2)).resolves.toBe(MINED_RESULT.SUCCESS)

      await expect(miningDirector.successfullyMined(1, 3)).resolves.toBe(
        MINED_RESULT.CHAIN_CHANGED,
      )
    })

    it('discards block if not valid', async () => {
      const { strategy, chain, node, miningDirector } = nodeTest
      strategy.disableMiningReward()

      const block = await makeBlockAfter(chain, chain.genesis)
      node.miningDirector.recentBlocks.set(2, block)

      jest
        .spyOn(chain.verifier, 'verifyBlock')
        .mockResolvedValue({ valid: false, reason: VerificationResultReason.INVALID_TARGET })

      await expect(miningDirector.successfullyMined(1, 2)).resolves.toBe(
        MINED_RESULT.INVALID_BLOCK,
      )
    })

    it('discard block if cannot add to chain', async () => {
      const { strategy, chain, node, miningDirector } = nodeTest
      strategy.disableMiningReward()

      const block = await makeBlockAfter(chain, chain.genesis)
      node.miningDirector.recentBlocks.set(2, block)

      jest.spyOn(chain, 'addBlock').mockResolvedValue({
        isAdded: false,
        reason: VerificationResultReason.INVALID_TARGET,
        score: 0,
      })

      await expect(miningDirector.successfullyMined(1, 2)).resolves.toBe(
        MINED_RESULT.ADD_FAILED,
      )
    })

    it('adds block on successful mining', async () => {
      const { strategy, chain, node } = nodeTest
      strategy.disableMiningReward()

      const onNewBlockSpy = jest.spyOn(node.miningDirector.onNewBlock, 'emit')

      const block = await useMinerBlockFixture(chain, 2)
      node.miningDirector.recentBlocks.set(1, block)

      await node.miningDirector.successfullyMined(5, 1)
      expect(onNewBlockSpy).toBeCalledWith(block)
    })
  })
})
