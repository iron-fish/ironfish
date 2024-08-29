/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route eth/accounts', () => {
  const routeTest = createRouteTest(false)

  it('should fetch account addresses on the node', async () => {
    const { node } = routeTest
    node.chain.consensus.parameters.enableEvmDescriptions = 2

    const account = await useAccountFixture(node.wallet, 'test')
    const address = Address.fromPrivateKey(Buffer.from(account.spendingKey, 'hex'))

    const response = await routeTest.client.eth.accounts(undefined)

    expect(response.status).toEqual(200)
    expect(response.content).toEqual([address.toString()])
  })
})
