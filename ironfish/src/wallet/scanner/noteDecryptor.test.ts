/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { Block } from '../../primitives'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../../testUtilities'
import { Account } from '../../wallet'
import { BackgroundNoteDecryptor, DecryptNotesFromTransactionsCallback } from './noteDecryptor'

describe('BackgroundNoteDecryptor', () => {
  const nodeTest = createNodeTest()

  /**
   * Creates a series of notes on the chain, and returns the blocks that contain such notes.
   */
  const createTestNotes = async (
    spec: ReadonlyArray<[account: Account, notesCount: number]>,
  ): Promise<Array<Block>> => {
    const blocks = []
    for (const [account, notesCount] of spec) {
      for (let i = 0; i < notesCount; i++) {
        const block = await useMinerBlockFixture(
          nodeTest.chain,
          undefined,
          account,
          nodeTest.wallet,
        )
        await expect(nodeTest.chain).toAddBlock(block)
        blocks.push(block)
      }
    }
    return blocks
  }

  it('decrypts notes belonging to different accounts', async () => {
    const accountA = await useAccountFixture(nodeTest.wallet, 'a')
    const accountB = await useAccountFixture(nodeTest.wallet, 'b')

    const blocks = await createTestNotes([
      [accountA, 5],
      [accountB, 3],
      [accountA, 2],
      [accountB, 2],
    ])
    expect(blocks.length).toBe(12)

    const decryptor = new BackgroundNoteDecryptor(nodeTest.workerPool, nodeTest.sdk.config, {
      decryptForSpender: true,
    })

    decryptor.start()

    const callback = jest.fn<DecryptNotesFromTransactionsCallback>()

    for (const block of blocks) {
      await decryptor.decryptNotesFromBlock(
        block.header,
        block.transactions,
        [accountA, accountB],
        callback,
      )
    }

    await decryptor.flush()
    decryptor.stop()

    // Check that the callback was called the right number of times
    expect(callback).toHaveBeenCalledTimes(2 * blocks.length)

    // Check that the correct number of notes was decrypted
    const totalNotesCount = new Map<string, number>()
    for (const [account, _blockHeader, transactions] of callback.mock.calls) {
      let notesForAccount = totalNotesCount.get(account.id) ?? 0
      notesForAccount += transactions
        .map(({ decryptedNotes }) => decryptedNotes.length)
        .reduce((acc, item) => acc + item, 0)
      totalNotesCount.set(account.id, notesForAccount)
    }
    expect(totalNotesCount).toEqual(
      new Map([
        [accountA.id, 7],
        [accountB.id, 5],
      ]),
    )

    // Check the individual callback calls
    const expectedCalls = [
      { account: accountA, block: blocks[0], decrypted: true },
      { account: accountB, block: blocks[0], decrypted: false },
      { account: accountA, block: blocks[1], decrypted: true },
      { account: accountB, block: blocks[1], decrypted: false },
      { account: accountA, block: blocks[2], decrypted: true },
      { account: accountB, block: blocks[2], decrypted: false },
      { account: accountA, block: blocks[3], decrypted: true },
      { account: accountB, block: blocks[3], decrypted: false },
      { account: accountA, block: blocks[4], decrypted: true },
      { account: accountB, block: blocks[4], decrypted: false },

      { account: accountA, block: blocks[5], decrypted: false },
      { account: accountB, block: blocks[5], decrypted: true },
      { account: accountA, block: blocks[6], decrypted: false },
      { account: accountB, block: blocks[6], decrypted: true },
      { account: accountA, block: blocks[7], decrypted: false },
      { account: accountB, block: blocks[7], decrypted: true },

      { account: accountA, block: blocks[8], decrypted: true },
      { account: accountB, block: blocks[8], decrypted: false },
      { account: accountA, block: blocks[9], decrypted: true },
      { account: accountB, block: blocks[9], decrypted: false },

      { account: accountA, block: blocks[10], decrypted: false },
      { account: accountB, block: blocks[10], decrypted: true },
      { account: accountA, block: blocks[11], decrypted: false },
      { account: accountB, block: blocks[11], decrypted: true },
    ]
    expect(callback).toHaveBeenCalledTimes(expectedCalls.length)

    let noteIndex = nodeTest.chain.genesis.noteSize

    for (const [callIndex, { account, block, decrypted }] of expectedCalls.entries()) {
      const transactions = block.transactions.map((transaction) => {
        const decryptedNotes = []
        if (decrypted) {
          Assert.isNotNull(noteIndex)
          decryptedNotes.push({
            index: noteIndex,
            forSpender: false,
            hash: expect.anything(),
            nullifier: expect.anything(),
            serializedNote: expect.anything(),
          })
          noteIndex += 1
        }
        return { transaction, decryptedNotes }
      })
      expect(callback).toHaveBeenNthCalledWith(
        callIndex + 1,
        account,
        block.header,
        transactions,
      )
    }
  })
})
