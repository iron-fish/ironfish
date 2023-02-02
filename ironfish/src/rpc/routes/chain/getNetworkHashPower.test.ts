/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { GetNetworkHashPowerResponse } from './getNetworkHashPower'

describe('Route chain/getNetworkHashPower', () => {
  const routeTest = createRouteTest(true)
  let sender: Account

  beforeAll(async () => {
    sender = await useAccountFixture(routeTest.node.wallet, 'existingAccount')
  })

  it('get network hash power', async () => {
    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])
      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    const response = await routeTest.client
      .request<GetNetworkHashPowerResponse>('chain/getNetworkHashPower', {
        lookup: 5,
      })
      .waitForEnd()
    console.log(routeTest.chain.genesis.timestamp.getTime(), routeTest.chain.genesis.work)
    console.log(routeTest.chain.head.timestamp.getTime(), routeTest.chain.head.work)
    console.log(
      (Number(routeTest.chain.head.work) - Number(routeTest.chain.genesis.work)) /
        ((routeTest.chain.head.timestamp.getTime() -
          routeTest.chain.genesis.timestamp.getTime()) /
          1000),
    )
    console.log(response.content.hashesPerSecond)
    // do something
  })
})
