/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useMinerBlockFixture } from '../../../testUtilities'
import { flushTimeout } from '../../../testUtilities/helpers/tests'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Block template stream', () => {
  const routeTest = createRouteTest()

  it('creates a new block to be mined when chain head changes', async () => {
    const node = routeTest.node
    const { chain, miningManager } = routeTest.node
    const account = await node.accounts.createAccount('testAccount', true)

    routeTest.node.config.set('miningForce', true)

    const createNewBlockTemplateSpy = jest.spyOn(miningManager, 'createNewBlockTemplate')

    const response = await routeTest.adapter
      .requestStream('miner/blockTemplateStream')
      .waitForRoute()

    // onConnectBlock can trigger while generating fixtures or if this test is run in isolation,
    // which would call createNewBlockTemplate twice, so we can clear the listener to ensure it
    // will only be called once.
    chain.onConnectBlock.clear()

    const previous = await useMinerBlockFixture(chain, 2, account, node.accounts)

    await expect(chain).toAddBlock(previous)
    await flushTimeout()

    response.end()

    expect(createNewBlockTemplateSpy).toBeCalledTimes(1)
  }, 10000)
})
