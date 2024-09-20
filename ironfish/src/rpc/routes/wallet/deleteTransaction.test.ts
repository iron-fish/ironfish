/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useAccountFixture, useMinerBlockFixture, useTxFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/deleteTransaction', () => {
  const routeTest = createRouteTest()

  it('should return true when deleting a transaction', async () => {
    const accountA = await useAccountFixture(routeTest.node.wallet, 'existingAccount')

    const block2 = await useMinerBlockFixture(
      routeTest.chain,
      undefined,
      accountA,
      routeTest.node.wallet,
    )
    await expect(routeTest.node.chain).toAddBlock(block2)
    await routeTest.node.wallet.scan()

    const transaction = await useTxFixture(routeTest.node.wallet, accountA, accountA)

    const response = await routeTest.client.wallet.deleteTransaction({
      hash: transaction.hash().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.deleted).toBe(true)
  })

  it('should return false when not deleting a transaction', async () => {
    const accountA = await useAccountFixture(routeTest.node.wallet, 'existingAccount')

    const block2 = await useMinerBlockFixture(
      routeTest.chain,
      undefined,
      accountA,
      routeTest.node.wallet,
    )
    await expect(routeTest.node.chain).toAddBlock(block2)
    await routeTest.node.wallet.scan()

    const transaction = await useTxFixture(routeTest.node.wallet, accountA, accountA)

    const block3 = await useMinerBlockFixture(
      routeTest.node.chain,
      undefined,
      accountA,
      routeTest.node.wallet,
      [transaction],
    )
    await routeTest.node.chain.addBlock(block3)

    await routeTest.node.wallet.scan()

    const response = await routeTest.client.wallet.deleteTransaction({
      hash: transaction.hash().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.deleted).toBe(false)
  })
})
