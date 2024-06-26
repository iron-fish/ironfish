/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import '../testUtilities/matchers/blockchain'
import {
  Asset,
  generateKey,
  LATEST_TRANSACTION_VERSION,
  Note as NativeNote,
  Transaction as NativeTransaction,
} from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { getBlockSize, getBlockWithMinersFeeSize } from '../network/utils/serializers'
import { Block, BlockHeader, Transaction } from '../primitives'
import { transactionCommitment } from '../primitives/blockheader'
import { MintDescription } from '../primitives/mintDescription'
import { Target } from '../primitives/target'
import { SerializedTransaction, TransactionVersion } from '../primitives/transaction'
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
import { Account, Wallet } from '../wallet'
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
      const tx = await useMinersTxFixture(nodeTest.node)
      const serialized = tx.serialize()

      const result = await nodeTest.chain.verifier.verifyNewTransaction(
        new Transaction(serialized),
      )

      expect(result).toEqual({
        reason: VerificationResultReason.MINIMUM_FEE_NOT_MET,
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
        creator: asset.creator().toString('hex'),
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
      await nodeTest.node.wallet.scan()

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

      const reorderedTransactions = [block.transactions[1], block.transactions[0]]
      const invalidBlock = nodeTest.chain.newBlockFromRaw({
        header: {
          ...block.header,
          transactionCommitment: transactionCommitment(reorderedTransactions),
        },
        transactions: reorderedTransactions,
      })

      expect(await nodeTest.verifier.verifyBlock(invalidBlock)).toMatchObject({
        reason: VerificationResultReason.MINERS_FEE_EXPECTED,
        valid: false,
      })
    })

    it('rejects a block with miners fee as second transaction', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet, 'accountA')
      const { block } = await useBlockWithTx(nodeTest.node)
      const minersFee = await useMinersTxFixture(nodeTest.node, account, undefined, 0)

      const reorderedTransactions = [block.transactions[0], minersFee]
      const invalidBlock = nodeTest.chain.newBlockFromRaw({
        header: {
          ...block.header,
          transactionCommitment: transactionCommitment(reorderedTransactions),
        },
        transactions: reorderedTransactions,
      })

      expect(await nodeTest.verifier.verifyBlock(invalidBlock)).toMatchObject({
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
          const reward = nodeTest.chain.network.miningReward(minersBlock.header.sequence)
          const owner = key.publicAddress
          const minerNote1 = new NativeNote(
            owner,
            BigInt(reward / 2),
            Buffer.from(''),
            Asset.nativeId(),
            owner,
          )
          const minerNote2 = new NativeNote(
            owner,
            BigInt(reward / 2),
            Buffer.from(''),
            Asset.nativeId(),
            owner,
          )
          const transaction = new NativeTransaction(LATEST_TRANSACTION_VERSION)
          transaction.output(minerNote1)
          transaction.output(minerNote2)
          return new Transaction(transaction._postMinersFeeUnchecked(key.spendingKey))
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

      const invalidMinersBlock = nodeTest.chain.newBlockFromRaw({
        header: {
          ...minersBlock.header,
          transactionCommitment: transactionCommitment([invalidMinersTransaction]),
        },
        transactions: [invalidMinersTransaction],
      })

      expect(await nodeTest.verifier.verifyBlock(invalidMinersBlock)).toMatchObject({
        reason: VerificationResultReason.MINERS_FEE_EXPECTED,
        valid: false,
      })
    })

    it('rejects a block with no transactions', async () => {
      const block = await useMinerBlockFixture(nodeTest.node.chain)

      const invalidBlock = nodeTest.chain.newBlockFromRaw({
        header: {
          ...block.header,
          transactionCommitment: transactionCommitment([]),
        },
        transactions: [],
      })

      expect(await nodeTest.verifier.verifyBlock(invalidBlock)).toMatchObject({
        reason: VerificationResultReason.MINERS_FEE_EXPECTED,
        valid: false,
      })
    })

    it('rejects block with incorrect fee sum', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet, 'accountA')
      const { block } = await useBlockWithTx(nodeTest.node, account)

      const extraTransaction = await usePostTxFixture({
        node: nodeTest.node,
        wallet: nodeTest.wallet,
        from: account,
        fee: 1n,
      })

      const invalidTransactions = [...block.transactions, extraTransaction]

      const invalidBlock = nodeTest.chain.newBlockFromRaw({
        header: {
          ...block.header,
          transactionCommitment: transactionCommitment(invalidTransactions),
        },
        transactions: invalidTransactions,
      })

      expect(await nodeTest.verifier.verifyBlock(invalidBlock)).toMatchObject({
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
      await nodeTest.node.wallet.scan()

      const blockB = await useMintBlockFixture({
        node: nodeTest.node,
        account,
        asset,
        value: BigInt(5),
      })
      await expect(nodeTest.node.chain).toAddBlock(blockB)
      await nodeTest.node.wallet.scan()

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

    it('rejects a block with an invalid mint owner', async () => {
      // Canary test to ensure verifyBlock is testing mint owners, specific
      // verifyMintOwner logic has tests below
      const account = await useAccountFixture(nodeTest.node.wallet)
      const accountB = await useAccountFixture(nodeTest.node.wallet, 'accountB')
      const asset = new Asset(account.publicAddress, 'testcoin', '')

      const block = await useMintBlockFixture({
        node: nodeTest.node,
        account,
        asset,
        value: BigInt(5),
      })

      block.transactions[1].mints[0].owner = Buffer.from(accountB.publicAddress, 'hex')

      expect(await nodeTest.verifier.verifyBlockConnect(block)).toMatchObject({
        reason: VerificationResultReason.INVALID_MINT_OWNER,
        valid: false,
      })
    })

    describe('rejects a block with a transaction containing an invalid version', () => {
      it('while transaction v1 is active', async () => {
        const { chain, verifier } = await nodeTest.createSetup()
        // Enable asset ownership to generate a v2 transaction
        chain.consensus.parameters.enableAssetOwnership = 1

        const block = await useMinerBlockFixture(chain)
        expect(block.transactions[0].version()).toEqual(TransactionVersion.V2)

        // Deactivate asset ownership so the blockchain expects v1 transactions
        chain.consensus.parameters.enableAssetOwnership = Number.MAX_SAFE_INTEGER

        expect(await verifier.verifyBlock(block)).toMatchObject({
          reason: VerificationResultReason.INVALID_TRANSACTION_VERSION,
          valid: false,
        })
      })

      it('while v2 is active', async () => {
        const { chain, verifier } = await nodeTest.createSetup()
        // Deactivate asset ownership to generate a v1 transaction
        chain.consensus.parameters.enableAssetOwnership = Number.MAX_SAFE_INTEGER

        const block = await useMinerBlockFixture(chain)
        expect(block.transactions[0].version()).toEqual(TransactionVersion.V1)

        // Enable asset ownership to so the blockchain expects v2 transactions
        chain.consensus.parameters.enableAssetOwnership = 1

        expect(await verifier.verifyBlock(block)).toMatchObject({
          reason: VerificationResultReason.INVALID_TRANSACTION_VERSION,
          valid: false,
        })
      })
    })

    describe('accepts a block with a transaction containing a valid version', () => {
      it('while transaction v1 is active', async () => {
        const { chain, verifier } = await nodeTest.createSetup()
        chain.consensus.parameters.enableAssetOwnership = 999999

        const block = await useMinerBlockFixture(chain)
        expect(block.transactions[0].version()).toEqual(TransactionVersion.V1)

        expect(await verifier.verifyBlock(block)).toMatchObject({
          valid: true,
        })
      })

      it('while transaction v2 is active', async () => {
        const { chain, verifier } = await nodeTest.createSetup()
        chain.consensus.parameters.enableAssetOwnership = 1

        const block = await useMinerBlockFixture(chain)
        expect(block.transactions[0].version()).toEqual(TransactionVersion.V2)

        expect(await verifier.verifyBlock(block)).toMatchObject({
          valid: true,
        })
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

    it('fails validation if graffiti field is not equal to 32 bytes', () => {
      const invalidHeader31Byte = new BlockHeader(
        {
          ...header,
          graffiti: Buffer.alloc(31),
        },
        header.hash,
        header.noteSize,
        header.work,
      )

      expect(nodeTest.verifier.verifyBlockHeader(invalidHeader31Byte)).toMatchObject({
        reason: VerificationResultReason.GRAFFITI,
        valid: false,
      })

      const invalidHeader33Byte = new BlockHeader(
        {
          ...header,
          graffiti: Buffer.alloc(33),
        },
        header.hash,
        header.noteSize,
        header.work,
      )

      expect(nodeTest.verifier.verifyBlockHeader(invalidHeader33Byte)).toMatchObject({
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

      const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
        ...block.header,
        target: Target.minTarget(),
      })

      expect(
        nodeTest.verifier.verifyBlockHeaderContextual(invalidHeader, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.INVALID_TARGET,
      })
    })

    it('Is invalid when the sequence is wrong', async () => {
      const block = await useMinerBlockFixture(nodeTest.chain)

      const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
        ...block.header,
        sequence: 9999,
      })

      expect(
        nodeTest.verifier.verifyBlockHeaderContextual(invalidHeader, nodeTest.chain.genesis),
      ).toMatchObject({
        valid: false,
        reason: VerificationResultReason.SEQUENCE_OUT_OF_ORDER,
      })
    })

    describe('Before postive block mine time activation', () => {
      const nodeTest = createNodeTest()
      let block: Block
      let header: BlockHeader
      let prevHeader: BlockHeader
      let verifier: Verifier

      beforeAll(async () => {
        const { chain, verifier: verifierTest } = await nodeTest.createSetup()
        chain.consensus.parameters.enforceSequentialBlockTime = 3
        verifier = verifierTest
        verifier.chain = chain
        block = await useMinerBlockFixture(
          chain,
          chain.consensus.parameters.enforceSequentialBlockTime - 1,
        )
        header = block.header
        const previousBlock = block.header.previousBlockHash
        const previousHeader = await chain.getHeader(previousBlock)
        Assert.isNotNull(previousHeader)
        prevHeader = previousHeader
      })

      it('fails validation when timestamp is too low', async () => {
        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(
            prevHeader.timestamp.getTime() -
              (nodeTest.chain.consensus.parameters.allowedBlockFutureSeconds + 2) * 1000,
          ),
        })

        const invalidBlock = new Block(invalidHeader, block.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          reason: VerificationResultReason.BLOCK_TOO_OLD,
          valid: false,
        })
      })

      it('fails validation when timestamp is too far in the future', async () => {
        jest
          .spyOn(global.Date, 'now')
          .mockImplementationOnce(() => prevHeader.timestamp.getTime() + 40 * 1000)

        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(
            prevHeader.timestamp.getTime() +
              (nodeTest.chain.consensus.parameters.allowedBlockFutureSeconds + 42) * 1000,
          ),
        })

        const invalidBlock = new Block(invalidHeader, block.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          reason: VerificationResultReason.TOO_FAR_IN_FUTURE,
          valid: false,
        })
      })

      it('pass validation when timestamp is smaller than previous block', async () => {
        jest
          .spyOn(global.Date, 'now')
          .mockImplementationOnce(() => prevHeader.timestamp.getTime() + 1 * 1000)

        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(prevHeader.timestamp.getTime() - 1 * 1000),
        })

        const invalidBlock = new Block(invalidHeader, block.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          valid: true,
        })
      })

      it('pass validation when timestamp is greater than previous block', async () => {
        jest
          .spyOn(global.Date, 'now')
          .mockImplementationOnce(() => prevHeader.timestamp.getTime() + 1 * 1000)

        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(prevHeader.timestamp.getTime() + 1 * 1000),
        })

        const invalidBlock = new Block(invalidHeader, block.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          valid: true,
        })
      })
    })

    describe('After postive block mine time activation', () => {
      const nodeTest = createNodeTest()
      let currentBlock: Block
      let header: BlockHeader
      let prevHeader: BlockHeader
      let verifier: Verifier

      beforeAll(async () => {
        const { chain, verifier: verifierTest } = await nodeTest.createSetup()
        chain.consensus.parameters.enforceSequentialBlockTime = 3
        verifier = verifierTest
        verifier.chain = chain

        const previousBlock = await useMinerBlockFixture(
          chain,
          chain.consensus.parameters.enforceSequentialBlockTime - 1,
        )
        await chain.addBlock(previousBlock)

        prevHeader = previousBlock.header
        currentBlock = await useMinerBlockFixture(
          chain,
          chain.consensus.parameters.enforceSequentialBlockTime,
        )
        header = currentBlock.header
      })

      it('fails validation when timestamp is too low', async () => {
        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(
            prevHeader.timestamp.getTime() -
              (nodeTest.chain.consensus.parameters.allowedBlockFutureSeconds + 2) * 1000,
          ),
        })

        const invalidBlock = new Block(invalidHeader, currentBlock.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          reason: VerificationResultReason.BLOCK_TOO_OLD,
          valid: false,
        })
      })

      it('fails validation when timestamp is too far in the future', async () => {
        jest
          .spyOn(global.Date, 'now')
          .mockImplementationOnce(() => prevHeader.timestamp.getTime() + 40 * 1000)

        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(
            prevHeader.timestamp.getTime() +
              (nodeTest.chain.consensus.parameters.allowedBlockFutureSeconds + 42) * 1000,
          ),
        })

        const invalidBlock = new Block(invalidHeader, currentBlock.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          reason: VerificationResultReason.TOO_FAR_IN_FUTURE,
          valid: false,
        })
      })

      it('fails validation when timestamp is smaller than previous block', async () => {
        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(prevHeader.timestamp.getTime() - 1 * 1000),
        })

        const invalidBlock = new Block(invalidHeader, currentBlock.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          reason: VerificationResultReason.BLOCK_TOO_OLD,
          valid: false,
        })
      })

      it('fails validation when timestamp is same as previous block', async () => {
        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(prevHeader.timestamp.getTime()),
        })

        const invalidBlock = new Block(invalidHeader, currentBlock.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          reason: VerificationResultReason.BLOCK_TOO_OLD,
          valid: false,
        })
      })

      it('pass validation when timestamp is greater than previous block', async () => {
        jest
          .spyOn(global.Date, 'now')
          .mockImplementationOnce(() => prevHeader.timestamp.getTime() + 1 * 1000)

        const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw({
          ...header,
          timestamp: new Date(prevHeader.timestamp.getTime() + 1 * 1000),
        })

        const invalidBlock = new Block(invalidHeader, currentBlock.transactions)

        expect(await verifier.verifyBlockAdd(invalidBlock, prevHeader)).toMatchObject({
          valid: true,
        })
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
      const { chain } = nodeTest
      const newBlock = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(newBlock)

      const invalidNewBlock = nodeTest.chain.newBlockFromRaw(
        {
          header: {
            ...newBlock.header,
            noteCommitment: Buffer.alloc(newBlock.header.noteCommitment.length, 'NOOO'),
          },
          transactions: newBlock.transactions,
        },
        newBlock.header.noteSize,
        newBlock.header.work,
      )

      await expect(
        nodeTest.verifier.verifyConnectedBlock(invalidNewBlock),
      ).resolves.toMatchObject({
        valid: false,
        reason: VerificationResultReason.NOTE_COMMITMENT,
      })
    })
  })

  describe('mint owners', () => {
    const nodeTest = createNodeTest()

    let wallet: Wallet
    let verifier: Verifier
    let accountA: Account
    let accountB: Account
    let assetA: Asset
    let assetB: Asset
    let value: bigint

    beforeEach(async () => {
      const { wallet: w, verifier: v } = nodeTest

      wallet = w
      verifier = v

      accountA = await useAccountFixture(wallet, 'accountA')
      accountB = await useAccountFixture(wallet, 'accountB')

      assetA = new Asset(accountA.publicAddress, 'testcoin', '')
      assetB = new Asset(accountB.publicAddress, 'testcoin', '')
      value = 5n
    })

    function mintDescription(
      asset: Asset,
      ownerAccount: Account,
      transferOwnershipTo?: Account,
    ): MintDescription {
      return {
        asset,
        value,
        owner: Buffer.from(ownerAccount.publicAddress, 'hex'),
        transferOwnershipTo: transferOwnershipTo
          ? Buffer.from(transferOwnershipTo.publicAddress, 'hex')
          : null,
      }
    }

    function mockChainAsset(asset: Asset, ownerAccount: Account) {
      return jest.spyOn(verifier.chain, 'getAssetById').mockImplementationOnce(() =>
        Promise.resolve({
          createdTransactionHash: Buffer.alloc(32, 0),
          id: asset.id(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          creator: asset.creator(),
          owner: Buffer.from(ownerAccount.publicAddress, 'hex'),
          supply: 9999n,
        }),
      )
    }

    describe('verifyMintOwnersIncremental', () => {
      async function expectValid(
        mints: MintDescription[],
        lastKnownAssetOwners?: BufferMap<Buffer>,
        expectedAssetOwnersState?: BufferMap<Buffer>,
      ): Promise<void> {
        const result = await verifier.verifyMintOwnersIncremental(mints, lastKnownAssetOwners)
        expect(result.valid).toEqual(true)
        if (expectedAssetOwnersState) {
          expect(result.assetOwners.size).toEqual(expectedAssetOwnersState.size)
          for (const [assetId, assetOwner] of result.assetOwners.entries()) {
            const expected = expectedAssetOwnersState.get(assetId)
            expect(assetOwner).toEqual(expected)
          }
        }
      }

      async function expectInvalid(
        mints: MintDescription[],
        lastKnownAssetOwners?: BufferMap<Buffer>,
      ): Promise<void> {
        const result = await verifier.verifyMintOwnersIncremental(mints, lastKnownAssetOwners)
        expect(result.valid).toEqual(false)
      }

      function createAssetOwners(
        ownersArray: Array<Array<Asset | Account>>,
      ): BufferMap<Buffer> {
        const assetOwners = new BufferMap<Buffer>()
        for (const [asset, ownerAccount] of ownersArray) {
          Assert.isInstanceOf(asset, Asset)
          Assert.isInstanceOf(ownerAccount, Account)
          assetOwners.set(asset.id(), Buffer.from(ownerAccount.publicAddress, 'hex'))
        }

        return assetOwners
      }

      it('rejects initial mint when owner does not match creator', async () => {
        const mint = mintDescription(assetA, accountB)
        await expectInvalid([mint])
      })

      it('rejects mint when owner does not match asset db', async () => {
        mockChainAsset(assetA, accountA)
        const mint = mintDescription(assetA, accountB)
        await expectInvalid([mint])
      })

      it('rejects subsequent mint with different owner', async () => {
        const mint1Valid = mintDescription(assetA, accountA)
        const mint2DifferentOwner = mintDescription(assetA, accountB)
        await expectInvalid([mint1Valid, mint2DifferentOwner])
      })

      it('rejects mints using the old owner if the owner changes', async () => {
        const mint1Valid = mintDescription(assetA, accountA)
        const mint2ChangeOwner = mintDescription(assetA, accountA, accountB)
        const mint3OldOwner = mintDescription(assetA, accountA)
        await expectInvalid([mint1Valid, mint2ChangeOwner, mint3OldOwner])
      })

      it('rejects mints using an invalid owner based on the passed in owners map', async () => {
        const mint1ChangeOwner = mintDescription(assetA, accountA, accountB)
        const lastKnownAssetOwners = createAssetOwners([[assetA, accountB]])
        await expectInvalid([mint1ChangeOwner], lastKnownAssetOwners)
      })

      it('accepts a valid initial mint', async () => {
        const mint = mintDescription(assetA, accountA)
        const expectedOwners = createAssetOwners([[assetA, accountA]])
        await expectValid([mint], undefined, expectedOwners)
      })

      it('accepts a valid mint', async () => {
        mockChainAsset(assetA, accountA)
        const mint = mintDescription(assetA, accountA)
        const expectedOwners = createAssetOwners([[assetA, accountA]])
        await expectValid([mint], undefined, expectedOwners)
      })

      it('accepts multiple valid mints', async () => {
        const mint1 = mintDescription(assetA, accountA)
        const mint2 = mintDescription(assetB, accountB)
        const mint3 = mintDescription(assetA, accountA)
        const mint4ChangeOwner = mintDescription(assetB, accountB, accountA)
        const mint5NewOwner = mintDescription(assetB, accountA)

        const expectedOwners = createAssetOwners([
          [assetA, accountA],
          [assetB, accountA],
        ])

        await expectValid(
          [mint1, mint2, mint3, mint4ChangeOwner, mint5NewOwner],
          undefined,
          expectedOwners,
        )
      })

      it('accepts mints that are valid based on the passed in owners map', async () => {
        const mint1 = mintDescription(assetA, accountB)
        const mint2 = mintDescription(assetA, accountB, accountA)
        const mint3 = mintDescription(assetA, accountA)
        const lastKnownAssetOwners = createAssetOwners([[assetA, accountB]])
        const expectedOwners = createAssetOwners([[assetA, accountA]])

        await expectValid([mint1, mint2, mint3], lastKnownAssetOwners, expectedOwners)
      })
    })

    describe('verifyMintOwners', () => {
      it('should reject with the correct error when mint is invalid', async () => {
        const mint = mintDescription(assetA, accountB)
        await expect(verifier.verifyMintOwners([mint])).resolves.toEqual({
          valid: false,
          reason: VerificationResultReason.INVALID_MINT_OWNER,
        })
      })

      it('should accept when mint is valid', async () => {
        const mint = mintDescription(assetA, accountA)
        await expect(verifier.verifyMintOwners([mint])).resolves.toEqual({
          valid: true,
        })
      })
    })
  })
})
