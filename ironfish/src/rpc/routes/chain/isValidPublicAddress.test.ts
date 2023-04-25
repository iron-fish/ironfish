/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../../../testUtilities/matchers'
import { generateKey } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain.isValidPublicAddress', () => {
  const routeTest = createRouteTest()

  it(`should return false if address is invalid`, async () => {
    const address = Buffer.alloc(32, 'invalid_address')

    const response = await routeTest.client
      .request('chain/isValidPublicAddress', {
        address,
      })
      .waitForEnd()

    expect(response.content).toStrictEqual({ valid: false })
  })

  it(`should return true if address is valid`, async () => {
    const address = generateKey().publicAddress

    const response = await routeTest.client
      .request('chain/isValidPublicAddress', {
        address,
      })
      .waitForEnd()

    expect(response.content).toStrictEqual({ valid: true })
  })
})
