/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { Blockchain } from '../../blockchain'
import { Block, BlockHeader } from '../../primitives'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../../testUtilities'
import { AsyncUtils } from '../../utils'
import { Account, Wallet } from '../../wallet'
import { BackgroundNoteDecryptor } from './noteDecryptor'

describe('WalletScanner', () => {
  const nodeTest = createNodeTest()

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  /**
   * Creates a series of notes on the chain, and returns the blocks that contain such notes.
   */
  const createTestNotes = async (
    chain: Blockchain,
    wallet: Wallet,
    spec: ReadonlyArray<[account: Account, notesCount: number]>,
  ): Promise<Array<Block>> => {
    const blocks = []
    for (const [account, notesCount] of spec) {
      for (let i = 0; i < notesCount; i++) {
        const block = await useMinerBlockFixture(chain, undefined, account, wallet)
        await expect(chain).toAddBlock(block)
        blocks.push(block)
      }
    }
    return blocks
  }

  it('adds transactions to the wallet db with decrypted notes', async () => {
    const connectBlockForAccount = jest.spyOn(nodeTest.wallet, 'connectBlockForAccount')

    const account = await useAccountFixture(nodeTest.wallet, 'a')
    const blocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[account, 3]])

    expect(connectBlockForAccount).not.toHaveBeenCalled()
    await nodeTest.wallet.scan()
    expect(connectBlockForAccount).toHaveBeenCalledTimes(3)

    const initialNoteIndex = nodeTest.chain.genesis.noteSize
    Assert.isNotNull(initialNoteIndex)

    for (const [i, block] of blocks.entries()) {
      expect(block.transactions.length).toBe(1)

      expect(connectBlockForAccount).toHaveBeenNthCalledWith(
        i + 1,
        account,
        block.header,
        block.transactions.map((transaction) => ({
          transaction,
          decryptedNotes: [
            expect.objectContaining({
              index: i + initialNoteIndex,
              forSpender: false,
              hash: expect.anything(),
              nullifier: expect.anything(),
              serializedNote: expect.anything(),
            }),
          ],
        })),
        true,
      )

      for (const transaction of block.transactions) {
        const storedTransaction = await account.getTransaction(transaction.hash())
        expect(storedTransaction).toBeDefined()
        expect(storedTransaction?.blockHash).toEqual(block.header.hash)
        expect(storedTransaction?.sequence).toEqual(block.header.sequence)
      }
    }

    const allStoredTransactions = await AsyncUtils.materialize(account.getTransactions())
    expect(allStoredTransactions.length).toBe(3)

    await expect(account.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
      confirmed: 3n * 2000000000n,
      unconfirmed: 3n * 2000000000n,
    })
  })

  it('updates the account head hash', async () => {
    const account = await useAccountFixture(nodeTest.wallet, 'a')
    const blocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[account, 3]])

    await nodeTest.wallet.scan()

    const accountHead = await account.getHead()
    expect(accountHead?.hash).toEqualHash(blocks[2].header.hash)
  })

  it('ignores accounts that have scanning disabled', async () => {
    const connectBlockForAccount = jest.spyOn(nodeTest.wallet, 'connectBlockForAccount')

    const accountA = await useAccountFixture(nodeTest.wallet, 'a')
    const accountB = await useAccountFixture(nodeTest.wallet, 'b')
    const accountC = await useAccountFixture(nodeTest.wallet, 'c')
    const accountD = await useAccountFixture(nodeTest.wallet, 'd')

    await accountB.updateScanningEnabled(false)
    await accountD.updateScanningEnabled(false)

    const blocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [
      [accountA, 1],
      [accountB, 1],
      [accountC, 1],
      [accountD, 1],
      [accountD, 1],
      [accountB, 1],
      [accountA, 1],
      [accountC, 1],
    ])

    expect(connectBlockForAccount).not.toHaveBeenCalled()
    await nodeTest.wallet.scan()
    expect(connectBlockForAccount).toHaveBeenCalledTimes(16)

    const initialNoteIndex = nodeTest.chain.genesis.noteSize
    Assert.isNotNull(initialNoteIndex)

    const expectedConnectedAccountBlocks = [
      { account: accountA, block: blocks[0], decryptedNoteIndexes: [initialNoteIndex] },
      { account: accountC, block: blocks[0], decryptedNoteIndexes: [] },
      { account: accountA, block: blocks[1], decryptedNoteIndexes: [] },
      { account: accountC, block: blocks[1], decryptedNoteIndexes: [] },
      { account: accountA, block: blocks[2], decryptedNoteIndexes: [] },
      { account: accountC, block: blocks[2], decryptedNoteIndexes: [initialNoteIndex + 2] },
      { account: accountA, block: blocks[3], decryptedNoteIndexes: [] },
      { account: accountC, block: blocks[3], decryptedNoteIndexes: [] },
      { account: accountA, block: blocks[4], decryptedNoteIndexes: [] },
      { account: accountC, block: blocks[4], decryptedNoteIndexes: [] },
      { account: accountA, block: blocks[5], decryptedNoteIndexes: [] },
      { account: accountC, block: blocks[5], decryptedNoteIndexes: [] },
      { account: accountA, block: blocks[6], decryptedNoteIndexes: [initialNoteIndex + 6] },
      { account: accountC, block: blocks[6], decryptedNoteIndexes: [] },
      { account: accountA, block: blocks[7], decryptedNoteIndexes: [] },
      { account: accountC, block: blocks[7], decryptedNoteIndexes: [initialNoteIndex + 7] },
    ]

    for (const [
      i,
      { account, block, decryptedNoteIndexes },
    ] of expectedConnectedAccountBlocks.entries()) {
      expect(block.transactions.length).toBe(1)

      expect(connectBlockForAccount).toHaveBeenNthCalledWith(
        i + 1,
        account,
        block.header,
        block.transactions.map((transaction) => ({
          transaction,
          decryptedNotes: decryptedNoteIndexes.map(
            (index) =>
              expect.objectContaining({
                index,
                forSpender: false,
                hash: expect.anything(),
                nullifier: expect.anything(),
                serializedNote: expect.anything(),
              }) as unknown,
          ),
        })),
        true,
      )

      for (const transaction of block.transactions) {
        const storedTransaction = await account.getTransaction(transaction.hash())
        if (!decryptedNoteIndexes.length) {
          expect(storedTransaction).not.toBeDefined()
        } else {
          expect(storedTransaction).toBeDefined()
          expect(storedTransaction?.blockHash).toEqual(block.header.hash)
          expect(storedTransaction?.sequence).toEqual(block.header.sequence)
        }
      }
    }

    await expect(nodeTest.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject(
      {
        confirmed: 2n * 2000000000n,
        unconfirmed: 2n * 2000000000n,
      },
    )
    await expect(nodeTest.wallet.getBalance(accountB, Asset.nativeId())).resolves.toMatchObject(
      {
        confirmed: 0n,
        unconfirmed: 0n,
      },
    )
    await expect(nodeTest.wallet.getBalance(accountC, Asset.nativeId())).resolves.toMatchObject(
      {
        confirmed: 2n * 2000000000n,
        unconfirmed: 2n * 2000000000n,
      },
    )
    await expect(nodeTest.wallet.getBalance(accountD, Asset.nativeId())).resolves.toMatchObject(
      {
        confirmed: 0n,
        unconfirmed: 0n,
      },
    )

    expect((await accountA.getHead())?.hash).toEqualHash(blocks[7].header.hash)
    expect((await accountB.getHead())?.hash).toEqualHash(nodeTest.chain.genesis.hash)
    expect((await accountC.getHead())?.hash).toEqualHash(blocks[7].header.hash)
    expect((await accountD.getHead())?.hash).toEqualHash(nodeTest.chain.genesis.hash)
  })

  it('skips decryption for accounts with createdAt later than the block header', async () => {
    const accountA = await useAccountFixture(nodeTest.wallet, 'a')
    expect(accountA.createdAt?.sequence).toEqual(nodeTest.chain.genesis.sequence)

    const firstBlocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[accountA, 3]])

    const accountB = await useAccountFixture(nodeTest.wallet, 'b')
    expect(accountB.createdAt?.sequence).toEqual(firstBlocks[2].header.sequence)

    const lastBlocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[accountB, 3]])

    const decryptNotesFromBlock = jest.spyOn(
      BackgroundNoteDecryptor.prototype,
      'decryptNotesFromBlock',
    )

    await nodeTest.wallet.reset()
    await nodeTest.wallet.scan()

    const genesisBlock = await nodeTest.chain.getBlock(nodeTest.chain.genesis)
    Assert.isNotNull(genesisBlock)

    const blocks = [genesisBlock, ...firstBlocks, ...lastBlocks]

    expect(decryptNotesFromBlock).toHaveBeenCalledTimes(blocks.length)

    for (const [i, block] of blocks.slice(1, 3).entries()) {
      expect(decryptNotesFromBlock).toHaveBeenNthCalledWith(
        i + 2,
        block.header,
        block.transactions,
        [expect.objectContaining({ incomingViewKey: accountA.incomingViewKey })],
        expect.anything(),
      )
    }
    for (const [i, block] of blocks.slice(3).entries()) {
      expect(decryptNotesFromBlock).toHaveBeenNthCalledWith(
        i + 4,
        block.header,
        block.transactions,
        [
          expect.objectContaining({ incomingViewKey: accountA.incomingViewKey }),
          expect.objectContaining({ name: accountB.name }),
        ],
        expect.anything(),
      )
    }
  })

  it('skips blocks preceeding the lowest createdAt', async () => {
    const decryptNotesFromBlock = jest.spyOn(
      BackgroundNoteDecryptor.prototype,
      'decryptNotesFromBlock',
    )
    const connectBlockForAccount = jest.spyOn(nodeTest.wallet, 'connectBlockForAccount')

    const accountA = await useAccountFixture(nodeTest.wallet, 'a')
    const firstBlocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[accountA, 3]])
    await nodeTest.wallet.removeAccount(accountA)

    const accountB = await useAccountFixture(nodeTest.wallet, 'b')
    const lastBlocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[accountB, 3]])

    await nodeTest.wallet.reset()
    await nodeTest.wallet.scan()

    const blocks = [firstBlocks[2], ...lastBlocks]

    expect(decryptNotesFromBlock).toHaveBeenCalledTimes(blocks.length)
    expect(connectBlockForAccount).toHaveBeenCalledTimes(blocks.length)

    for (const [i, block] of blocks.entries()) {
      expect(decryptNotesFromBlock).toHaveBeenNthCalledWith(
        i + 1,
        block.header,
        block.transactions,
        [expect.objectContaining({ incomingViewKey: accountB.incomingViewKey })],
        expect.anything(),
      )
      expect(connectBlockForAccount).toHaveBeenNthCalledWith(
        i + 1,
        expect.objectContaining({ incomingViewKey: accountB.incomingViewKey }),
        block.header,
        expect.anything(),
        true,
      )
    }
  })

  it('skips blocks preceeding the lowest createdAt when createdAt is reset', async () => {
    const connectBlockForAccount = jest.spyOn(nodeTest.wallet, 'connectBlockForAccount')

    const accountA = await useAccountFixture(nodeTest.wallet, 'a')
    const firstBlocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[accountA, 3]])
    await nodeTest.wallet.removeAccount(accountA)

    const accountB = await useAccountFixture(nodeTest.wallet, 'b')
    const lastBlocks = await createTestNotes(nodeTest.chain, nodeTest.wallet, [[accountB, 3]])

    await nodeTest.wallet.reset({ resetCreatedAt: true })

    await nodeTest.wallet.getAccountByName(accountB.name)?.updateCreatedAt({
      hash: Buffer.alloc(32, 0),
      sequence: accountB.createdAt?.sequence || 0,
    })

    await nodeTest.wallet.scan()

    const blocks = [firstBlocks[2], ...lastBlocks]

    expect(connectBlockForAccount).toHaveBeenCalledTimes(blocks.length)

    for (const [i, block] of blocks.entries()) {
      expect(connectBlockForAccount).toHaveBeenNthCalledWith(
        i + 1,
        expect.objectContaining({ incomingViewKey: accountB.incomingViewKey }),
        block.header,
        expect.anything(),
        true,
      )
    }
  })

  describe('restarts scanning', () => {
    // Set up the BackgroundNoteDecryptor so that we can pause and resume the
    // scan after each block that gets processed.
    let continueScan: () => void = () => {}
    let notifyDecryptCall: ((blockHeader: BlockHeader) => void) | null = null
    let decryptCallPromise: Promise<BlockHeader> | null = null

    const nextDecryptCall = async (): Promise<BlockHeader> => {
      Assert.isNotNull(decryptCallPromise)
      const blockHeader = await decryptCallPromise
      decryptCallPromise = new Promise((resolve) => {
        notifyDecryptCall = resolve
      })
      return blockHeader
    }

    const patchWalletScanner = (wallet: Wallet) => {
      const connectBlockOrig = wallet.scanner.connectBlock.bind(wallet.scanner)
      jest
        .spyOn(wallet.scanner, 'connectBlock')
        .mockImplementation(async (blockHeader, ...args) => {
          Assert.isNotNull(notifyDecryptCall)
          notifyDecryptCall(blockHeader)
          void connectBlockOrig(blockHeader, ...args)
          return new Promise((resolve) => {
            continueScan = resolve
          })
        })

      decryptCallPromise = new Promise((resolve) => {
        notifyDecryptCall = resolve
      })
    }

    it('when accounts are imported', async () => {
      const { chain, wallet } = await nodeTest.createSetup({
        config: { walletSyncingMaxQueueSize: 1 },
      })
      patchWalletScanner(wallet)

      // Create 2 accounts, and remove the first one (so that we can re-import it later)
      const genesisBlock = await chain.getBlock(chain.genesis)
      Assert.isNotNull(genesisBlock)
      const blocks = [genesisBlock]
      const accountA = await useAccountFixture(wallet, 'a')
      blocks.push(...(await createTestNotes(chain, wallet, [[accountA, 5]])))
      const accountB = await useAccountFixture(wallet, 'b')
      blocks.push(...(await createTestNotes(chain, wallet, [[accountB, 5]])))
      await wallet.removeAccount(accountA)

      expect(blocks.length).toBe(11)

      // Start scanning
      await wallet.reset()
      const scanPromise = wallet.scan()

      // Check that the scanning begins at the `accountB` creation block (and scan a few blocks)
      for (let i = 5; i <= 8; i++) {
        continueScan()
        const firstBlockHeader = await nextDecryptCall()
        expect(firstBlockHeader.hash).toEqualHash(blocks[i].header.hash)
      }

      // Now import `accountA`
      await wallet.importAccount(accountA.serialize())

      // Check that scanning resumes at the `accountA` creation block (and scan till the end)
      for (let i = 0; i <= 10; i++) {
        continueScan()
        const blockHeader = await nextDecryptCall()
        expect(blockHeader.hash).toEqualHash(blocks[i].header.hash)
      }

      // Scan should be done
      continueScan()
      await scanPromise
    })

    it('when accounts are deleted', async () => {
      const { chain, wallet } = await nodeTest.createSetup({
        config: { walletSyncingMaxQueueSize: 1 },
      })
      patchWalletScanner(wallet)

      // Create 2 accounts
      const genesisBlock = await chain.getBlock(chain.genesis)
      Assert.isNotNull(genesisBlock)
      const blocks = [genesisBlock]
      const accountA = await useAccountFixture(wallet, 'a')
      blocks.push(...(await createTestNotes(chain, wallet, [[accountA, 5]])))
      const accountB = await useAccountFixture(wallet, 'b')
      blocks.push(...(await createTestNotes(chain, wallet, [[accountB, 5]])))

      expect(blocks.length).toBe(11)

      // Start scanning
      await wallet.reset()
      const scanPromise = wallet.scan()

      // Check that the scanning begins at the `accountA` creation block (and scan a few blocks)
      for (let i = 0; i <= 2; i++) {
        continueScan()
        const blockHeader = await nextDecryptCall()
        expect(blockHeader.hash).toEqualHash(blocks[i].header.hash)
      }

      // Now delete `accountA`
      //
      // (Need to use `removeAccountByName` instead of `removeAccount` because
      // the previous call to `wallet.reset()` has caused the account id to
      // change)
      await wallet.removeAccountByName(accountA.name)

      // Check that scanning skips blocks and resumes at the `accountB` creation block (and scan till the end)
      for (let i = 5; i <= 10; i++) {
        continueScan()
        const blockHeader = await nextDecryptCall()
        expect(blockHeader.hash).toEqualHash(blocks[i].header.hash)
      }

      // Scan should be done
      continueScan()
      await scanPromise
    })

    it('when accounts are reset', async () => {
      const { chain, wallet } = await nodeTest.createSetup({
        config: { walletSyncingMaxQueueSize: 1 },
      })
      patchWalletScanner(wallet)

      const genesisBlock = await chain.getBlock(chain.genesis)
      Assert.isNotNull(genesisBlock)
      const blocks = [genesisBlock]
      const account = await useAccountFixture(wallet, 'a')
      blocks.push(...(await createTestNotes(chain, wallet, [[account, 5]])))

      expect(blocks.length).toBe(6)

      // Start scanning
      await wallet.reset()
      const scanPromise = wallet.scan()

      // Check that the scanning begins at the genesis block (and scan a few blocks)
      for (let i = 0; i <= 3; i++) {
        continueScan()
        const blockHeader = await nextDecryptCall()
        expect(blockHeader.hash).toEqualHash(blocks[i].header.hash)
      }

      // Reset the wallet
      await wallet.reset()

      // Check that scanning restarts from the genesis block (and scan till the end)
      for (let i = 0; i <= 5; i++) {
        continueScan()
        const blockHeader = await nextDecryptCall()
        expect(blockHeader.hash).toEqualHash(blocks[i].header.hash)
      }

      // Scan should be done
      continueScan()
      await scanPromise
    })
  })
})
