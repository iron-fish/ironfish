/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { createRawTransaction } from '../../../testUtilities/helpers/transaction'

describe('Route wallet/postTransaction', () => {
  const routeTest = createRouteTest(true)

  // TODO remove this when it's not needed for copying anymore
  it('should return account status information', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)
    const response = await routeTest.client
      .request<any>('wallet/getAccountsStatus', {})
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      accounts: [
        {
          name: account.name,
          id: account.id,
          headHash: 'NULL',
          headInChain: false,
          sequence: 'NULL',
        },
      ],
    })
  })

  it('should accept a valid raw transaction', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)
    const options = {
      wallet: routeTest.node.wallet,
      from: account
    }
    const rawTransaction = await createRawTransaction(
      options
    )
    const response = await routeTest.client
      .request<any>('wallet/postTransaction', {
        transaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()
  })
  it('should return an error if the transaction won\'t deserialize', async () => {

    const response = await routeTest.client
      .request<any>('wallet/postTransaction', {
        transaction: '0xdeadbeef',
      })
      .waitForEnd()

    expect(response.status).toBe(400)
    expect(response.content.transaction).toBeUndefined()
  })
})
