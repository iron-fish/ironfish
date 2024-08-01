/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RawTransactionSerde } from '../../../primitives'
import { useAccountFixture } from '../../../testUtilities'
import { createRawTransaction } from '../../../testUtilities/helpers/transaction'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/addSignature', () => {
  const routeTest = createRouteTest(true)

  it('should return error if signature is not a valid hex', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'addSignatureAccount')
    const rawTransaction = await createRawTransaction({
      wallet: routeTest.node.wallet,
      from: account,
    })

    const response = await routeTest.client.wallet.buildTransaction({
      rawTransaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content.unsignedTransaction).toBeDefined()

    const invalidSignature = 'invalid'

    await expect(
      routeTest.client.wallet.addSignature({
        unsignedTransaction: response.content.unsignedTransaction,
        signature: invalidSignature,
      }),
    ).rejects.toThrow('Invalid signature length')
  })
})
