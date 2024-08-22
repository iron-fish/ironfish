/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route eth/ethRouter', () => {
  const routeTest = createRouteTest(false)

  it('should handle eth_sendTransaction successfully', async () => {
    const { node } = routeTest
    const account = await useAccountFixture(node.wallet, 'test')
    const address = Address.fromPrivateKey(Buffer.from(account.spendingKey, 'hex'))

    const transactionRequest = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'eth_sendTransaction' as const,
      params: [
        {
          from: address.toString(),
          to: address.toString(),
          gas: '0x5208',
          gasPrice: '0x0',
          value: '0x0',
          data: '0x',
        },
      ],
    }

    const response = await routeTest.client.eth.ethRouter(transactionRequest)

    expect(response.status).toEqual(200)
    expect(response.content).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: expect.anything(),
    })
  })
})
