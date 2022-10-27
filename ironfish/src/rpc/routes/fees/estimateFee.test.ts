/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { EstimateFeeRequest } from './estimateFee'

describe('estimate Fee', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('existingAccount', true)
    const node = routeTest.node
    const { block } = await useBlockWithTx(node, undefined, undefined, true, {
      fee: 1,
    })
    await node.chain.addBlock(block)
    await node.wallet.updateHead()
  })

  it('should return fee', async () => {
    const response = await routeTest.client
      .request<EstimateFeeRequest>('fees/estimateFee', {
        fromAccountName: 'existingAccount',
        priority: 'low',
        receives: [
          {
            publicAddress: 'test2',
            amount: BigInt(10).toString(),
            memo: '',
          },
        ],
      })
      .waitForEnd()

    expect(response.content).toMatchObject({
      fee: '1',
    })
  })

  it('should return fee with default priority', async () => {
    const response = await routeTest.client
      .request<EstimateFeeRequest>('fees/estimateFee', {
        fromAccountName: 'existingAccount',
        receives: [
          {
            publicAddress: 'test2',
            amount: BigInt(10).toString(),
            memo: '',
          },
        ],
      })
      .waitForEnd()

    expect(response.content).toMatchObject({
      fee: '1',
    })
  })
})
