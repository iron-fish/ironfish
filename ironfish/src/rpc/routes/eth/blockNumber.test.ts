/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { EthUtils } from '../../../utils'

describe('Route eth/blockNumber', () => {
  const routeTest = createRouteTest()

  it('Updates block number as new blocks are added', async () => {
    const { chain } = routeTest
    await chain.open()

    let response = await routeTest.client.eth.blockNumber()
    expect(response.content).toMatchObject({
      number: EthUtils.numToHex(EthUtils.ifToEthSequence(1)),
    })

    let block = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block)

    response = await routeTest.client.eth.blockNumber()
    expect(response.content).toMatchObject({
      number: EthUtils.numToHex(EthUtils.ifToEthSequence(2)),
    })

    block = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block)

    response = await routeTest.client.eth.blockNumber()
    expect(response.content).toMatchObject({
      number: EthUtils.numToHex(EthUtils.ifToEthSequence(3)),
    })
  })
})
