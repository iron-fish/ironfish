/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getTransactionSize } from '../network/utils/serializers'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'

describe('Mining manager', () => {
  const nodeTest = createNodeTest()

  it('should not add expired transaction to block', async () => {
    const { node, chain, wallet } = nodeTest
    const { miningManager } = node

    // Create an account with some money
    const account = await useAccountFixture(wallet)
    const block1 = await useMinerBlockFixture(chain, undefined, account, wallet)
    await expect(chain).toAddBlock(block1)
    await wallet.updateHead()

    const transaction = await useTxFixture(
      wallet,
      account,
      account,
      undefined,
      undefined,
      chain.head.sequence + 2,
    )

    jest.spyOn(node.memPool, 'orderedTransactions').mockImplementation(function* () {
      yield transaction
    })

    let results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1, 0))
      .blockTransactions
    expect(results).toHaveLength(1)
    expect(results[0].unsignedHash().equals(transaction.unsignedHash())).toBe(true)

    // It shouldn't be returned after 1 more block is added
    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1, 0))
      .blockTransactions
    expect(results).toHaveLength(0)
  })

  it('should stop adding transactions before block size exceeds MAX_BLOCK_SIZE_BYTES', async () => {
    const { node, chain, wallet } = nodeTest
    const { miningManager } = node

    // Create an account with some money
    const account = await useAccountFixture(wallet)
    const block1 = await useMinerBlockFixture(chain, undefined, account, wallet)
    await expect(chain).toAddBlock(block1)
    await wallet.updateHead()

    const transaction = await useTxFixture(
      wallet,
      account,
      account,
      undefined,
      undefined,
      chain.head.sequence + 2,
    )

    node.memPool.acceptTransaction(transaction)
    chain.consensus.MAX_BLOCK_SIZE_BYTES = 0

    let results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1, 0))
      .blockTransactions
    expect(results).toHaveLength(0)

    // Expand max block size, should allow transaction to be added to block
    chain.consensus.MAX_BLOCK_SIZE_BYTES = getTransactionSize(transaction)

    results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1, 0))
      .blockTransactions
    expect(results).toHaveLength(1)
    expect(results[0].hash().compare(transaction.hash())).toBe(0)
  })
})
