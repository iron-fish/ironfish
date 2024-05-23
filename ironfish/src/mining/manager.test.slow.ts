/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus'
import { getBlockWithMinersFeeSize, getTransactionSize } from '../network/utils/serializers'
import { Target, Transaction } from '../primitives'
import { TransactionVersion } from '../primitives/transaction'
import { BlockTemplateSerde, SerializedBlockTemplate } from '../serde'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  usePostTxFixture,
  useTxFixture,
} from '../testUtilities'
import { isTransactionMine } from '../testUtilities/helpers/transaction'
import { PromiseUtils } from '../utils'
import { MINED_RESULT, MiningManager } from './manager'

/*
 * Helper function to wait for the first `numTemplates` block templates
 */
function collectTemplates(
  miningManager: MiningManager,
  numTemplates: number,
): Promise<SerializedBlockTemplate[]> {
  const templates: SerializedBlockTemplate[] = []
  const [promise, resolve] = PromiseUtils.split<SerializedBlockTemplate[]>()

  const handler = (template: SerializedBlockTemplate) => {
    templates.push(template)
    if (templates.length === numTemplates) {
      resolve(templates)
    }
  }

  miningManager.onNewBlockTemplate(handler)

  return promise.then((templates: SerializedBlockTemplate[]) => {
    miningManager.offNewBlockTemplate(handler)
    return templates
  })
}

describe('Mining manager', () => {
  const nodeTest = createNodeTest(false, { config: { miningForce: true } })

  describe('create block template', () => {
    it('creates a new block template', async () => {
      const { chain, miningManager } = nodeTest.node

      const account = await useAccountFixture(nodeTest.node.wallet, 'account')
      await nodeTest.node.wallet.setDefaultAccount(account.name)

      const block = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(block)

      const currentHeadHash = chain.head.hash.toString('hex')

      // Wait for the first block template
      const template = (await collectTemplates(miningManager, 1))[0]

      expect(template.header.previousBlockHash).toBe(currentHeadHash)
      expect(template.transactions).toHaveLength(1)

      const minersFee = new Transaction(Buffer.from(template.transactions[0], 'hex'))
      expect(isTransactionMine(minersFee, account)).toBe(true)
    })

    it('adds transactions from the mempool', async () => {
      const { node, chain } = nodeTest
      const { miningManager } = node

      const account = await useAccountFixture(nodeTest.node.wallet, 'account')
      await nodeTest.node.wallet.setDefaultAccount(account.name)

      const previous = await useMinerBlockFixture(chain, 2, account, node.wallet)
      await expect(chain).toAddBlock(previous)
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, account, account)

      expect(node.memPool.count()).toBe(0)
      node.memPool.acceptTransaction(transaction)
      expect(node.memPool.count()).toBe(1)

      const block = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(block)

      // Wait for the first 2 block templates
      const templates = await collectTemplates(miningManager, 2)
      const fullTemplate = templates.find((t) => t.transactions.length > 1)

      Assert.isNotUndefined(fullTemplate)

      expect(fullTemplate.header.previousBlockHash).toBe(chain.head.hash.toString('hex'))
      expect(fullTemplate.transactions).toHaveLength(2)

      const minersFee = new Transaction(Buffer.from(fullTemplate.transactions[0], 'hex'))
      expect(isTransactionMine(minersFee, account)).toBe(true)

      expect(fullTemplate.transactions[1]).toEqual(transaction.serialize().toString('hex'))
      expect(node.memPool.count()).toBe(1)
    })

    it('should not add transactions to block if they have invalid spends', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'a')
      const accountB = await useAccountFixture(nodeA.wallet, 'b')
      await nodeA.wallet.setDefaultAccount(accountA.name)

      const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
      await expect(nodeA.chain).toAddBlock(blockA1)

      const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB1)
      const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB2)

      // This transaction will be invalid after the reorg
      await nodeA.wallet.scan()
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

      const templates = await collectTemplates(nodeA.miningManager, 2)
      const fullTemplate = templates.find((t) => t.transactions.length > 1)

      expect(fullTemplate).toBeUndefined()
    })

    it('should not add expired transaction to block', async () => {
      const { node, chain, wallet } = nodeTest

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      const block1 = await useMinerBlockFixture(chain, undefined, account, wallet)
      await expect(chain).toAddBlock(block1)
      await wallet.scan()

      const transaction = await useTxFixture(
        wallet,
        account,
        account,
        undefined,
        undefined,
        chain.head.sequence + 2,
      )

      node.memPool.acceptTransaction(transaction)

      const templates = await collectTemplates(node.miningManager, 2)
      const fullTemplate = templates.find((t) => t.transactions.length > 1)

      Assert.isNotUndefined(fullTemplate)
      expect(fullTemplate.transactions).toHaveLength(2)
      expect(fullTemplate.transactions[1]).toEqual(transaction.serialize().toString('hex'))

      // It shouldn't be returned after 1 more block is added
      const block2 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block2)

      const templates2 = await collectTemplates(node.miningManager, 2)
      const fullTemplate2 = templates2.find((t) => t.transactions.length > 1)

      expect(fullTemplate2).toBeUndefined()
    })

    it('should only add mints with valid owners', async () => {
      const { node, chain, wallet } = nodeTest

      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      await wallet.setDefaultAccount(accountA.name)

      for (let i = 0; i < 4; i++) {
        const block = await useMinerBlockFixture(chain, undefined, accountA)
        await expect(chain).toAddBlock(block)
      }
      await wallet.scan()

      // Initial mint of an asset, sets the asset owner in the internal state
      const mintTx1 = await usePostTxFixture({
        node,
        wallet,
        from: accountA,
        fee: 20n,
        mints: [
          {
            creator: accountA.publicAddress,
            name: 'Testcoin',
            metadata: '',
            value: 5n,
          },
        ],
      })

      // Second mint of this asset, has incorrect owner
      const mintTx2 = await usePostTxFixture({
        node,
        wallet,
        from: accountA,
        fee: 15n,
        mints: [
          {
            creator: accountA.publicAddress,
            name: 'Testcoin',
            metadata: '',
            value: 5n,
          },
        ],
      })
      mintTx2.mints[0].owner = Buffer.from(accountB.publicAddress, 'hex')

      // Third mint of this asset, has valid owner but lowest fee, ensuring it
      // is included after the previous invalid mint is skipped over
      const mintTx3 = await usePostTxFixture({
        node,
        wallet,
        from: accountA,
        fee: 5n,
        mints: [
          {
            creator: accountA.publicAddress,
            name: 'Testcoin',
            metadata: '',
            value: 5n,
          },
        ],
      })

      // Mint of an unrelated asset, should be included with no issues
      const mintTx4 = await usePostTxFixture({
        node,
        wallet,
        from: accountA,
        fee: 1n,
        mints: [
          {
            creator: accountA.publicAddress,
            name: 'Othercoin',
            metadata: '',
            value: 5n,
          },
        ],
      })

      expect(node.memPool.acceptTransaction(mintTx1)).toEqual(true)
      expect(node.memPool.acceptTransaction(mintTx2)).toEqual(true)
      expect(node.memPool.acceptTransaction(mintTx3)).toEqual(true)
      expect(node.memPool.acceptTransaction(mintTx4)).toEqual(true)

      // Wait for the first 2 block templates
      const templates = await collectTemplates(node.miningManager, 2)
      const fullTemplate = templates.find((t) => t.transactions.length > 1)

      Assert.isNotUndefined(fullTemplate)
      expect(fullTemplate.transactions).toHaveLength(4)
      // Mint 1 has the highest fee, so it should be picked up first
      expect(fullTemplate.transactions[1]).toEqual(mintTx1.serialize().toString('hex'))
      // Mint 2 has an invalid owner, so it should be skipped
      expect(fullTemplate.transactions[2]).toEqual(mintTx3.serialize().toString('hex'))
      // Mint of a different asset, should be picked up
      expect(fullTemplate.transactions[3]).toEqual(mintTx4.serialize().toString('hex'))

      await expect(node.miningManager.submitBlockTemplate(fullTemplate)).resolves.toEqual(
        MINED_RESULT.SUCCESS,
      )
    })

    it('should not add transactions with an incorrect version', async () => {
      const { node, chain, wallet } = nodeTest

      // Enable V1 transactions
      chain.consensus.parameters.enableAssetOwnership = 999999

      const account = await useAccountFixture(wallet, 'account')
      await wallet.setDefaultAccount(account.name)

      for (let i = 0; i < 2; i++) {
        const block = await useMinerBlockFixture(chain, undefined, account)
        await expect(chain).toAddBlock(block)
      }
      await wallet.scan()

      const mintTx1 = await usePostTxFixture({
        node,
        wallet,
        from: account,
        fee: 3n,
        mints: [
          {
            creator: account.publicAddress,
            name: 'Testcoin',
            metadata: '',
            value: 5n,
          },
        ],
      })
      expect(mintTx1.version()).toEqual(TransactionVersion.V1)
      expect(node.memPool.acceptTransaction(mintTx1)).toEqual(true)

      // Enable V2 transactions
      chain.consensus.parameters.enableAssetOwnership = 1

      const mintTx2 = await usePostTxFixture({
        node,
        wallet,
        from: account,
        fee: 1n,
        mints: [
          {
            creator: account.publicAddress,
            name: 'Testcoin2',
            metadata: '',
            value: 5n,
          },
        ],
      })

      expect(node.memPool.acceptTransaction(mintTx2)).toEqual(true)

      // Wait for the first 2 block templates
      const templates = await collectTemplates(node.miningManager, 2)
      const fullTemplate = templates.find((t) => t.transactions.length > 1)

      Assert.isNotUndefined(fullTemplate)
      expect(fullTemplate.transactions).toHaveLength(2)
      expect(fullTemplate.transactions[1]).toEqual(mintTx2.serialize().toString('hex'))
    })

    it('should stop adding transactions before block size exceeds maxBlockSizeBytes', async () => {
      const { node, chain, wallet } = nodeTest

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      const block1 = await useMinerBlockFixture(chain, undefined, account, wallet)
      await expect(chain).toAddBlock(block1)
      await wallet.scan()

      const transaction = await useTxFixture(
        wallet,
        account,
        account,
        undefined,
        undefined,
        chain.head.sequence + 2,
      )

      node.memPool.acceptTransaction(transaction)
      chain.consensus.parameters.maxBlockSizeBytes = getBlockWithMinersFeeSize()

      const templates = await collectTemplates(node.miningManager, 2)
      const fullTemplate = templates.find((t) => t.transactions.length > 1)

      expect(fullTemplate).toBeUndefined()

      // Expand max block size, should allow transaction to be added to block
      chain.consensus.parameters.maxBlockSizeBytes =
        getBlockWithMinersFeeSize() + getTransactionSize(transaction)

      const templates2 = await collectTemplates(node.miningManager, 2)
      const fullTemplate2 = templates2.find((t) => t.transactions.length > 1)

      Assert.isNotUndefined(fullTemplate2)

      expect(fullTemplate2.transactions[1]).toEqual(transaction.serialize().toString('hex'))
    })

    it('should not try to create a full block if there are no transactions in the mempool', async () => {
      const { chain, miningManager } = nodeTest.node

      const createBlockTemplateSpy = jest.spyOn(miningManager, 'createNewBlockTemplate')

      const account = await useAccountFixture(nodeTest.node.wallet, 'account')
      await nodeTest.node.wallet.setDefaultAccount(account.name)

      const block = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(block)

      // Wait for the first block template
      const _template = (await collectTemplates(miningManager, 1))[0]

      expect(createBlockTemplateSpy).toHaveBeenCalledTimes(1)
    })

    it('should create a new empty block when head changes', async () => {
      const { chain, miningManager } = nodeTest.node

      const account = await useAccountFixture(nodeTest.node.wallet, 'account')
      await nodeTest.node.wallet.setDefaultAccount(account.name)

      const block = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(block)

      // Wait for the first block template
      const _template = (await collectTemplates(miningManager, 1))[0]

      // Change the chain head to trigger a new template
      const block3 = await useMinerBlockFixture(chain, 3)
      await expect(chain).toAddBlock(block3)

      // Wait for the block template
      const template = (await collectTemplates(miningManager, 1))[0]

      expect(template.header.previousBlockHash).toBe(block3.header.hash.toString('hex'))
    })

    it('should skip block verification for empty blocks', async () => {
      const { chain, miningManager } = nodeTest.node

      const account = await useAccountFixture(nodeTest.node.wallet, 'account')
      await nodeTest.node.wallet.setDefaultAccount(account.name)

      const block = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(block)

      const verifyBlockSpy = jest.spyOn(nodeTest.node.chain.verifier, 'verifyBlock')

      // Wait for the first block template
      await collectTemplates(miningManager, 1)

      expect(verifyBlockSpy).not.toHaveBeenCalled()
    })

    it('should re-send the empty template if verification fails for the full template', async () => {
      const { node, chain, wallet } = nodeTest

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      const block1 = await useMinerBlockFixture(chain, undefined, account, wallet)
      await expect(chain).toAddBlock(block1)
      await wallet.scan()

      const transaction = await useTxFixture(
        wallet,
        account,
        account,
        undefined,
        undefined,
        chain.head.sequence + 2,
      )

      node.memPool.acceptTransaction(transaction)

      jest
        .spyOn(nodeTest.node.chain.verifier, 'verifyBlock')
        .mockResolvedValue({ valid: false, reason: VerificationResultReason.ERROR })

      const templates = await collectTemplates(node.miningManager, 3)

      expect(templates.length).toEqual(3)

      expect(templates[0]).toEqual(templates[2])
    })

    describe('with preemptive block creation disabled', () => {
      const nodeTest = createNodeTest(false, {
        config: { miningForce: true, preemptiveBlockMining: false },
      })

      it('does not create empty blocks when there are transactions in the mempool', async () => {
        const { node, chain } = nodeTest
        const { miningManager } = node

        const account = await useAccountFixture(nodeTest.node.wallet, 'account')
        await nodeTest.node.wallet.setDefaultAccount(account.name)

        const previous = await useMinerBlockFixture(chain, 2, account, node.wallet)
        await expect(chain).toAddBlock(previous)
        await node.wallet.scan()

        const transaction = await useTxFixture(node.wallet, account, account)

        expect(node.memPool.count()).toBe(0)
        node.memPool.acceptTransaction(transaction)
        expect(node.memPool.count()).toBe(1)

        const block = await useMinerBlockFixture(chain, 2)
        await expect(chain).toAddBlock(block)

        // Wait for the first block template
        const [fullTemplate] = await collectTemplates(miningManager, 1)

        Assert.isNotUndefined(fullTemplate)

        expect(fullTemplate.header.previousBlockHash).toBe(chain.head.hash.toString('hex'))
        expect(fullTemplate.transactions).toHaveLength(2)

        const minersFee = new Transaction(Buffer.from(fullTemplate.transactions[0], 'hex'))
        expect(isTransactionMine(minersFee, account)).toBe(true)

        expect(fullTemplate.transactions[1]).toEqual(transaction.serialize().toString('hex'))
        expect(node.memPool.count()).toBe(1)
      })
    })
  })

  describe('submit block template', () => {
    it('discards block if chain changed', async () => {
      const { node, chain, wallet } = nodeTest
      const { miningManager } = node

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      // Create an old block template to submit later
      const oldTemplate = (await collectTemplates(miningManager, 1))[0]

      // add both A1 and A2 to the chain
      const blockA1 = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(chain, 3)
      await expect(chain).toAddBlock(blockA2)

      await expect(miningManager.submitBlockTemplate(oldTemplate)).resolves.toBe(
        MINED_RESULT.CHAIN_CHANGED,
      )

      // Create an old block template to submit later
      const newTemplate = (await collectTemplates(miningManager, 1))[0]

      await expect(miningManager.submitBlockTemplate(newTemplate)).resolves.toBe(
        MINED_RESULT.SUCCESS,
      )
    })

    it('discards block if not valid', async () => {
      const { node, chain, wallet } = nodeTest
      const { miningManager } = node

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      const template = (await collectTemplates(miningManager, 1))[0]

      jest
        .spyOn(chain.verifier, 'verifyBlock')
        .mockResolvedValue({ valid: false, reason: VerificationResultReason.INVALID_TARGET })

      await expect(miningManager.submitBlockTemplate(template)).resolves.toBe(
        MINED_RESULT.ADD_FAILED,
      )
    })

    it('discard block if cannot add to chain', async () => {
      const { node, chain, wallet } = nodeTest
      const { miningManager } = node

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      const template = (await collectTemplates(miningManager, 1))[0]

      jest.spyOn(chain, 'addBlock').mockResolvedValue({
        isAdded: false,
        isFork: null,
        reason: VerificationResultReason.INVALID_TARGET,
        score: 0,
      })

      await expect(miningManager.submitBlockTemplate(template)).resolves.toBe(
        MINED_RESULT.ADD_FAILED,
      )
    })

    it('discard block if on a fork', async () => {
      // This test should not really be possible since we make sure whether the template
      // is heavier than the chain head before adding it. If it is heavier, it would not be a fork.
      // However, it could be possible through a race condition so keeping this test for now.s

      const { node, chain, wallet } = nodeTest
      const { miningManager } = node

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      const template = (await collectTemplates(miningManager, 1))[0]

      jest.spyOn(chain, 'addBlock').mockResolvedValue({
        isAdded: true,
        isFork: true,
        reason: null,
        score: 0,
      })

      await expect(miningManager.submitBlockTemplate(template)).resolves.toBe(MINED_RESULT.FORK)
    })

    it('adds block if chain changed but block is heavier', async () => {
      const { node, chain, wallet } = nodeTest
      const { miningManager } = node

      // Create an account with some money
      const account = await useAccountFixture(wallet)
      await wallet.setDefaultAccount(account.name)

      const firstBlock = await chain.getBlock(chain.head)
      Assert.isNotNull(firstBlock)

      // Create 2 blocks at the same sequence, one with higher difficulty
      const blockA1 = await useMinerBlockFixture(chain, undefined, account, wallet)
      const blockB1Temp = await useMinerBlockFixture(chain, undefined, account, wallet)
      const blockB1 = nodeTest.chain.newBlockFromRaw({
        header: {
          ...blockB1Temp.header,
          target: Target.fromDifficulty(blockA1.header.target.toDifficulty() + 1n),
        },
        transactions: blockB1Temp.transactions,
      })

      await expect(chain).toAddBlock(blockA1)

      const templateA2 = (await collectTemplates(miningManager, 1))[0]

      await expect(chain).toAddBlock(blockB1)

      // Increase difficulty of submitted template so it
      const blockA2Temp = BlockTemplateSerde.deserialize(templateA2, nodeTest.chain)
      const blockA2 = nodeTest.chain.newBlockFromRaw({
        header: {
          ...blockA2Temp.header,
          target: Target.fromDifficulty(blockA2Temp.header.target.toDifficulty() + 2n),
        },
        transactions: blockA2Temp.transactions,
      })

      const templateToSubmit = BlockTemplateSerde.serialize(blockA2, firstBlock)

      // Check that we are submitting a template that does not attack to current head
      expect(templateToSubmit.header.previousBlockHash).not.toEqual(
        chain.head.hash.toString('hex'),
      )

      await expect(miningManager.submitBlockTemplate(templateToSubmit)).resolves.toBe(
        MINED_RESULT.SUCCESS,
      )
    })

    it('onNewBlock is called when a template is submitted successfully', async () => {
      const { chain, miningManager } = nodeTest.node

      const account = await useAccountFixture(nodeTest.node.wallet, 'account')
      await nodeTest.node.wallet.setDefaultAccount(account.name)

      const block = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(block)

      // Wait for the first block template
      const template = (await collectTemplates(miningManager, 1))[0]

      const onNewBlockSpy = jest.spyOn(miningManager.onNewBlock, 'emit')

      await expect(miningManager.submitBlockTemplate(template)).resolves.toBe(
        MINED_RESULT.SUCCESS,
      )

      const submittedBlock = BlockTemplateSerde.deserialize(template, nodeTest.chain)
      const newBlock = onNewBlockSpy.mock.calls[0][0]
      expect(newBlock.header.hash).toEqual(submittedBlock.header.hash)
    })
  })
})
