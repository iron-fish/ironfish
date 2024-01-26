/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route multisig/createSigningCommitment', () => {
  const routeTest = createRouteTest()

  it('should error on invalid keypackage', async () => {
    const keyPackage = 'invalid key package'

    const request = { keyPackage, seed: 0 }

    await expect(
      routeTest.client.request('multisig/createSigningCommitment', request).waitForEnd(),
    ).rejects.toThrow('InvalidData')
  })
})
