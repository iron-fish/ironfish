/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('estimate Fee', () => {
  const routeTest = createRouteTest(true)

  it('should return fee', async () => {
    await routeTest.node.wallet.createAccount('existingAccount', true)
    const node = routeTest.node
    const { block } = await useBlockWithTx(node, undefined, undefined, true, {
      fee: 1,
    })
    await node.chain.addBlock(block)
    await node.wallet.updateHead()

    const response = await routeTest.client.estimateFee({
      fromAccountName: 'existingAccount',
      receives: [
        {
          publicAddress: 'test2',
          amount: BigInt(10).toString(),
          memo: '',
        },
      ],
    })

    expect(response.content).toMatchObject({
      low: '1',
      medium: '1',
      high: '1',
    })
  })
})
