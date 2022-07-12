/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'

describe('Mining manager', () => {
  const nodeTest = createNodeTest()

  it('should not add expired transaction to block', async () => {
    const { node, chain, accounts } = nodeTest
    const { miningManager } = nodeTest.node

    // Create an account with some money
    const account = await useAccountFixture(accounts)
    const block1 = await useMinerBlockFixture(chain, undefined, account, accounts)
    await expect(chain).toAddBlock(block1)
    await accounts.updateHead()

    const transaction = await useTxFixture(
      accounts,
      account,
      account,
      undefined,
      undefined,
      chain.head.sequence + 2,
    )

    jest.spyOn(node.memPool, 'orderedTransactions').mockImplementation(function* () {
      yield transaction
    })

    let results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1))
      .blockTransactions
    expect(results).toHaveLength(1)
    expect(results[0].unsignedHash().equals(transaction.unsignedHash())).toBe(true)

    // It shouldn't be returned after 1 more block is added
    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1))
      .blockTransactions
    expect(results).toHaveLength(0)
  }, 10000)
})
