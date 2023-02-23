/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { ImportResponse } from './utils'

describe('Route wallet/importSpendAccount', () => {
  const routeTest = createRouteTest(true)

  it('should import a spending account', async () => {
    const key = generateKey()

    const accountName = 'foo'
    const response = await routeTest.client
      .request<ImportResponse>('wallet/importSpendAccount', {
        account: {
          name: accountName,
          viewKey: key.viewKey,
          publicAddress: key.publicAddress,
          incomingViewKey: key.incomingViewKey,
          outgoingViewKey: key.outgoingViewKey,
          version: 1,
        },
        rescan: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: accountName,
      isDefaultAccount: true,
    })
  })
})
