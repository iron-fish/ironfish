/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VerificationResultReason } from '../consensus/verifier'
import { BlockTemplateSerde } from '../serde/BlockTemplateSerde'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'
import { isTransactionMine } from '../testUtilities/helpers/transaction'
import { MINED_RESULT } from './manager'

describe('Mining manager', () => {
  const nodeTest = createNodeTest()

  it('creates a new block template', async () => {
    const { chain, miningManager } = nodeTest.node

    const account = await useAccountFixture(nodeTest.node.wallet, 'account', true)

    const block = await useMinerBlockFixture(chain, 2)
    await expect(chain).toAddBlock(block)

    const spy = jest.spyOn(BlockTemplateSerde, 'serialize')

    await miningManager.createNewBlockTemplate(block)

    expect(spy).toHaveBeenCalledTimes(1)
    const [newBlock, currentBlock] = spy.mock.calls[0]
    expect(newBlock.header.previousBlockHash.equals(chain.head.hash)).toBe(true)
    expect(newBlock.transactions).toHaveLength(1)
    expect(currentBlock).toEqual(block)
    expect(isTransactionMine(newBlock.transactions[0], account)).toBe(true)
  })

  it('adds transactions from the mempool', async () => {
    const { node, chain } = nodeTest
    const { miningManager } = node

    const account = await useAccountFixture(nodeTest.node.wallet, 'account', true)

    const previous = await useMinerBlockFixture(chain, 2, account, node.wallet)
    await expect(chain).toAddBlock(previous)
    await node.wallet.updateHead()

    const transaction = await useTxFixture(node.wallet, account, account)

    expect(node.memPool.count()).toBe(0)
    node.memPool.acceptTransaction(transaction)
    expect(node.memPool.count()).toBe(1)

    const spy = jest.spyOn(BlockTemplateSerde, 'serialize')
    spy.mockClear()

    await miningManager.createNewBlockTemplate(previous)

    expect(spy).toHaveBeenCalledTimes(1)
    const [newBlock, currentBlock] = spy.mock.calls[0]
    expect(newBlock.header.previousBlockHash.equals(chain.head.hash)).toBe(true)
    expect(newBlock.transactions).toHaveLength(2)
    expect(currentBlock).toEqual(previous)
    expect(isTransactionMine(newBlock.transactions[0], account)).toBe(true)
    expect(node.memPool.count()).toBe(1)
  })

  it('should not add transactions to block if they have invalid spends', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'a')
    const accountB = await useAccountFixture(nodeA.wallet, 'b')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
    await expect(nodeA.chain).toAddBlock(blockA1)

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)

    // This transaction will be invalid after the reorg
    await nodeA.wallet.updateHead()
    const invalidTx = await useTxFixture(nodeA.wallet, accountA, accountB)

    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    expect(nodeA.chain.head.hash.equals(blockB2.header.hash)).toBe(true)

    // invalidTx is trying to spend a note from A1 that has been removed once A1
    // was disconnected from the blockchain after the reorg, so should it should not
    // be added to the block
    //
    // G -> A1
    //   -> B2 -> B3

    const added = nodeA.memPool.acceptTransaction(invalidTx)
    expect(added).toBe(true)

    const { blockTransactions } = await nodeA.miningManager.getNewBlockTransactions(
      nodeA.chain.head.sequence + 1,
      0,
    )
    expect(blockTransactions).toHaveLength(0)
  })

  describe('submit block template', () => {
    it('discards block if chain changed', async () => {
      const { strategy, chain, node } = nodeTest
      const { miningManager } = node
      strategy.disableMiningReward()

      await nodeTest.node.wallet.createAccount('account', true)

      const blockA1 = await useMinerBlockFixture(chain, 2)
      const blockA2 = await useMinerBlockFixture(chain, 3)

      const blockTemplateA1 = await miningManager.createNewBlockTemplate(blockA1)
      await expect(chain).toAddBlock(blockA1)
      const blockTemplateA2 = await miningManager.createNewBlockTemplate(blockA2)

      await expect(miningManager.submitBlockTemplate(blockTemplateA1)).resolves.toBe(
        MINED_RESULT.CHAIN_CHANGED,
      )
      await expect(miningManager.submitBlockTemplate(blockTemplateA2)).resolves.toBe(
        MINED_RESULT.SUCCESS,
      )
    })

    it('discards block if not valid', async () => {
      const { strategy, chain, node } = nodeTest
      const { miningManager } = node
      strategy.disableMiningReward()

      await nodeTest.node.wallet.createAccount('account', true)

      const blockA1 = await useMinerBlockFixture(chain, 2)
      const blockTemplateA1 = await miningManager.createNewBlockTemplate(blockA1)

      jest
        .spyOn(chain.verifier, 'verifyBlock')
        .mockResolvedValue({ valid: false, reason: VerificationResultReason.INVALID_TARGET })

      await expect(miningManager.submitBlockTemplate(blockTemplateA1)).resolves.toBe(
        MINED_RESULT.INVALID_BLOCK,
      )
    })

    it('discard block if cannot add to chain', async () => {
      const { strategy, chain, node } = nodeTest
      const { miningManager } = node
      strategy.disableMiningReward()

      await nodeTest.node.wallet.createAccount('account', true)

      const blockA1 = await useMinerBlockFixture(chain, 2)
      const blockTemplateA1 = await miningManager.createNewBlockTemplate(blockA1)

      jest.spyOn(chain, 'addBlock').mockResolvedValue({
        isAdded: false,
        isFork: null,
        reason: VerificationResultReason.INVALID_TARGET,
        score: 0,
      })

      await expect(miningManager.submitBlockTemplate(blockTemplateA1)).resolves.toBe(
        MINED_RESULT.ADD_FAILED,
      )
    })

    it('discard block if on a fork', async () => {
      const { strategy, chain, node } = nodeTest
      const { miningManager } = node
      strategy.disableMiningReward()

      await nodeTest.node.wallet.createAccount('account', true)

      const blockA1 = await useMinerBlockFixture(chain, 2)
      const blockTemplateA1 = await miningManager.createNewBlockTemplate(blockA1)

      jest.spyOn(chain, 'addBlock').mockResolvedValue({
        isAdded: true,
        isFork: true,
        reason: null,
        score: 0,
      })

      await expect(miningManager.submitBlockTemplate(blockTemplateA1)).resolves.toBe(
        MINED_RESULT.FORK,
      )
    })

    it('adds block on successful mining', async () => {
      const { strategy, chain, node } = nodeTest
      const { miningManager } = node
      strategy.disableMiningReward()

      await nodeTest.node.wallet.createAccount('account', true)

      const onNewBlockSpy = jest.spyOn(miningManager.onNewBlock, 'emit')

      const blockA1 = await useMinerBlockFixture(chain, 2)
      const blockTemplateA1 = await miningManager.createNewBlockTemplate(blockA1)

      const validBlock = BlockTemplateSerde.deserialize(blockTemplateA1)
      // These values are what the code generates from the fixture block
      validBlock.header.noteSize = blockA1.header.noteSize
      validBlock.header.work = expect.any(BigInt)

      // This populates the _hash field on all transactions so that
      // the test passes. Without it the expected block and the actual
      // block passed to onNewBlockSpy would have different transaction._hash values
      for (const t of validBlock.transactions) {
        t.hash()
      }

      await miningManager.submitBlockTemplate(blockTemplateA1)
      expect(onNewBlockSpy).toHaveBeenCalledWith(validBlock)
    })
  })
})
