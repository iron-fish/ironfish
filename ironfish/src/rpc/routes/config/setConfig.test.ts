/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

jest.mock('axios')

describe('Route config/setConfig', () => {
  const routeTest = createRouteTest()

  it('should error if the config name does not exist', async () => {
    await expect(
      routeTest.client
        .request('config/setConfig', { name: 'asdf', value: 'asdf' })
        .waitForEnd(),
    ).rejects.toThrow()
  })
})
