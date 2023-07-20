/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import '../testUtilities/matchers/blockchain'
import {
  Asset,
  generateKey,
  Note as NativeNote,
  Transaction as NativeTransaction,
} from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { getBlockSize, getBlockWithMinersFeeSize } from '../network/utils/serializers'
import { BlockHeader, Transaction } from '../primitives'
import { transactionCommitment } from '../primitives/blockheader'
import { Target } from '../primitives/target'
import { SerializedTransaction } from '../primitives/transaction'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useBurnBlockFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useMintBlockFixture,
  usePostTxFixture,
  useTxSpendsFixture,
} from '../testUtilities'
import { useFixture } from '../testUtilities/fixtures/fixture'
import { VerificationResultReason, Verifier } from './verifier'

describe('Verifier', () => {
  describe('Transaction', () => {
    const nodeTest = createNodeTest()

    it('returns true on normal transactions', async () => {
      const { transaction: tx } = await useTxSpendsFixture(nodeTest.node)
      const serialized = tx.serialize()

      const result = await nodeTest.chain.verifier.verifyNewTransaction(
        new Transaction(serialized),
      )

      expect(result).toEqual({ valid: true })
    })

    it('returns false on miners transactions', async () => {
      const tx = await useMinersTxFixture(nodeTest.wallet)
      const serialized = tx.serialize()

      const result = await nodeTest.chain.verifier.verifyNewTransaction(
        new Transaction(serialized),
      )

      expect(result).toEqual({
        reason: VerificationResultReason.ERROR,
        valid: false,
      })
    })

    it('returns false on transaction replays', async () => {
      const { node, chain } = nodeTest
      const account = await useAccountFixture(nodeTest.node.wallet)
      const asset = new Asset(account.publicAddress, 'test asset', '')

      // Create the mint to replay
      const block3 = await useMintBlockFixture({ node, account: account, asset, value: 10n })
      await expect(chain).toAddBlock(block3)

      const mintTx = block3.transactions[1]

      const result = await chain.verifier.verifyNewTransaction(mintTx)

      expect(result).toEqual({
        reason: VerificationResultReason.DUPLICATE_TRANSACTION,
        valid: false,
      })
    })

    it('returns false on transactions larger than max size', async () => {
      const { transaction } = await useTxSpendsFixture(nodeTest.node)
      nodeTest.chain.consensus.parameters.maxBlockSizeBytes = getBlockWithMinersFeeSize()

      const result = Verifier.verifyCreatedTransaction(transaction, nodeTest.chain.consensus)

      expect(result).toEqual({
        reason: VerificationResultReason.MAX_TRANSACTION_SIZE_EXCEEDED,
        valid: false,
      })
    })

    it('returns false on transactions containing invalid mints', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet)
      const asset = new Asset(account.publicAddress, 'testcoin', '')
      const mintData = {
        name: asset.name().toString('utf8'),
        metadata: asset.metadata().toString('utf8'),
        value: 5n,
        isNewAsset: true,
      }

      const transaction = await usePostTxFixture({
        node: nodeTest.node,
        wallet: nodeTest.wallet,
        from: account,
        mints: [mintData],
      })

      jest.spyOn(transaction.mints[0].asset, 'name').mockReturnValue(Buffer.alloc(32, 0))

      const result = Verifier.verifyCreatedTransaction(transaction, nodeTest.chain.consensus)

      expect(result).toEqual({
        reason: VerificationResultReason.INVALID_ASSET_NAME,
        valid: false,
      })
    })

    it('returns false on transactions containing invalid burns', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet)

      const blockA = await useMinerBlockFixture(nodeTest.chain, 2, account)
      await expect(nodeTest.node.chain).toAddBlock(blockA)
      await nodeTest.node.wallet.updateHead()

      const transaction = await usePostTxFixture({
        node: nodeTest.node,
        wallet: nodeTest.wallet,
        from: account,
        burns: [{ assetId: Asset.nativeId(), value: BigInt(5) }],
      })

      const result = Verifier.verifyCreatedTransaction(transaction, nodeTest.chain.consensus)

      expect(result).toEqual({
        reason: VerificationResultReason.NATIVE_BURN,
        valid: false,
      })
    })

    it('returns false on transactions with fees below the minimum', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet)
      const txnFee = 0
      const transaction = await usePostTxFixture({
        node: nodeTest.node,
        wallet: nodeTest.wallet,
        from: account,
        fee: BigInt(txnFee),
      })

      nodeTest.chain.consensus.parameters.minFee = txnFee + 1

      const result = Verifier.verifyCreatedTransaction(transaction, nodeTest.chain.consensus)

      expect(result).toEqual({
        reason: VerificationResultReason.MINIMUM_FEE_NOT_MET,
        valid: false,
      })
    })
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

    it("rejects a block with standard (non-miner's) transaction fee as first transaction", async () => {
      const { block } = await useBlockWithTx(nodeTest.node)
      block.transactions = [block.transactions[1], block.transactions[0]]
      block.header.transactionCommitment = transactionCommitment(block.transactions)
      expect(block.transactions[0].fee()).toBeGreaterThan(0)

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.MINERS_FEE_EXPECTED,
        valid: false,
      })
    })

    it('rejects a block with miners fee as second transaction', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet, 'accountA')
      const { block } = await useBlockWithTx(nodeTest.node)
      block.transactions[1] = await useMinersTxFixture(nodeTest.wallet, account, undefined, 0)
      block.header.transactionCommitment = transactionCommitment(block.transactions)

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_TRANSACTION_FEE,
        valid: false,
      })
    })

    it('rejects a block with miners fee with multiple notes', async () => {
      const minersBlock = await useMinerBlockFixture(nodeTest.chain)

      // Make an invalid multiple-note miners fee transaction
      const invalidMinersTransaction = await useFixture(
        () => {
          const key = generateKey()
          const reward = nodeTest.strategy.miningReward(minersBlock.header.sequence)
          const owner = key.publicAddress
          const minerNote1 = new NativeNote(
            owner,
            BigInt(reward / 2),
            '',
            Asset.nativeId(),
            owner,
          )
          const minerNote2 = new NativeNote(
            owner,
            BigInt(reward / 2),
            '',
            Asset.nativeId(),
            owner,
          )
          const transaction = new NativeTransaction(key.spendingKey)
          transaction.output(minerNote1)
          transaction.output(minerNote2)
          return new Transaction(transaction._postMinersFeeUnchecked())
        },
        {
          process: async (): Promise<void> => {},
          serialize: (tx: Transaction): SerializedTransaction => {
            return tx.serialize()
          },
          deserialize: (tx: SerializedTransaction): Transaction => {
            return new Transaction(tx)
          },
        },
      )

      minersBlock.transactions[0] = invalidMinersTransaction
      minersBlock.header.transactionCommitment = transactionCommitment(minersBlock.transactions)

      expect(await nodeTest.verifier.verifyBlock(minersBlock)).toMatchObject({
        reason: VerificationResultReason.MINERS_FEE_EXPECTED,
        valid: false,
      })
    })

    it('rejects a block with no transactions', async () => {
      const block = await useMinerBlockFixture(nodeTest.node.chain)
      block.transactions = []
      block.header.transactionCommitment = transactionCommitment(block.transactions)

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.MINERS_FEE_EXPECTED,
        valid: false,
      })
    })

    it('rejects block with incorrect fee sum', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet, 'accountA')
      const { block } = await useBlockWithTx(nodeTest.node, account)
      block.transactions[2] = await usePostTxFixture({
        node: nodeTest.node,
        wallet: nodeTest.wallet,
        from: account,
        fee: 1n,
      })
      block.header.transactionCommitment = transactionCommitment(block.transactions)

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_MINERS_FEE,
        valid: false,
      })
    })

    it('rejects a block with size more than maxBlockSizeBytes', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      nodeTest.chain.consensus.parameters.maxBlockSizeBytes = getBlockSize(block) - 1

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        valid: false,
        reason: VerificationResultReason.MAX_BLOCK_SIZE_EXCEEDED,
      })
    })

    it('rejects a block with a transaction with fee less than minimum', async () => {
      const { block } = await useBlockWithTx(nodeTest.node)

      const fees = block.transactions.flatMap((tx) => Number(tx.fee()))
      const maxFee = Math.max(...fees)

      nodeTest.chain.consensus.parameters.minFee = maxFee + 1
      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        valid: false,
        reason: VerificationResultReason.MINIMUM_FEE_NOT_MET,
      })
    })

    it('rejects a block with an invalid mint', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet)
      const asset = new Asset(account.publicAddress, 'testcoin', '')

      const block = await useMintBlockFixture({
        node: nodeTest.node,
        account,
        asset,
        value: BigInt(5),
      })

      jest
        .spyOn(block.transactions[1].mints[0].asset, 'name')
        .mockReturnValue(Buffer.alloc(32, 0))

      expect(await nodeTest.verifier.verifyBlock(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_ASSET_NAME,
        valid: false,
      })
    })

    it('rejects a block with an invalid burn', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet)
      const asset = new Asset(account.publicAddress, 'testcoin', '')

      const blockA = await useMinerBlockFixture(nodeTest.chain, 2, account)
      await expect(nodeTest.node.chain).toAddBlock(blockA)
      await nodeTest.node.wallet.updateHead()

      const blockB = await useMintBlockFixture({
        node: nodeTest.node,
        account,
        asset,
        value: BigInt(5),
      })
      await expect(nodeTest.node.chain).toAddBlock(blockB)
      await nodeTest.node.wallet.updateHead()

      const blockC = await useBurnBlockFixture({
        node: nodeTest.node,
        account,
        asset,
        value: BigInt(5),
      })

      blockC.transactions[1].burns[0].assetId = Asset.nativeId()

      expect(await nodeTest.verifier.verifyBlock(blockC)).toMatchObject({
        reason: VerificationResultReason.NATIVE_BURN,
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
      const { chain } = nodeTest
      const block = await useMinerBlockFixture(chain)

      Assert.isEqual(block.counts().nullifiers, 0)

      expect((await chain.verifier.verifyConnectedSpends(block)).valid).toBe(true)
    })

    it('says the block with spends is valid', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockWithTx(nodeTest.node)
      expect((await chain.verifier.verifyConnectedSpends(block)).valid).toBe(true)
      expect(Array.from(block.spends())).toHaveLength(1)
    })

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
    })

    it('a block that spends a note in a previous block is invalid with INVALID_SPEND as the reason', async () => {
      const { chain } = nodeTest
      const { block } = await useBlockWithTx(nodeTest.node)

      jest.spyOn(block, 'spends').mockImplementationOnce(function* () {
        for (const spend of block.spends()) {
          yield { ...spend, size: 1 }
        }
      })

      expect(await chain.verifier.verifyConnectedSpends(block)).toEqual({
        valid: false,
        reason: VerificationResultReason.INVALID_SPEND,
      })
    })

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
    })
  })

  describe('verifyBlockHeaderContextual', () => {
    const nodeTest = createNodeTest()

    it('is valid', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)

      expect(
        nodeTest.verifier.verifyBlockHeaderContextual(block.header, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: true,
      })
    })

    it('is invalid when the target is wrong', async () => {
      nodeTest.verifier.enableVerifyTarget = true
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.target = Target.minTarget()

      expect(
        nodeTest.verifier.verifyBlockHeaderContextual(block.header, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.INVALID_TARGET,
      })
    })

    it('Is invalid when the timestamp is in past', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.timestamp = new Date(0)

      expect(
        nodeTest.verifier.verifyBlockHeaderContextual(block.header, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.BLOCK_TOO_OLD,
      })
    })

    it('Is invalid when the sequence is wrong', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)
      block.header.sequence = 9999

      expect(
        nodeTest.verifier.verifyBlockHeaderContextual(block.header, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.SEQUENCE_OUT_OF_ORDER,
      })
    })
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

    it('is false if the note hash is incorrect', async () => {
      nodeTest.chain.genesis.noteCommitment = Buffer.alloc(
        nodeTest.chain.genesis.noteCommitment.length,
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
  })
})
