/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route config/getConfig', () => {
  const routeTest = createRouteTest()

  it('should error if the config name does not exist', async () => {
    await expect(
      routeTest.adapter.request('config/getConfig', { name: 'asdf' }),
    ).rejects.toThrow()
  })

  it('returns value of the requested ConfigOptions', async () => {
    const target = { minerBatchSize: 10000 }
    const response = await routeTest.adapter.request('config/getConfig', {
      name: 'minerBatchSize',
    })
    expect(response.status).toBe(200)
    expect(response.content).toEqual(target)
  })

  it('returns nothing when no datadir exists', async () => {
    const target = {}
    const response = await routeTest.adapter.request('config/getConfig', {
      name: 'minerBatchSize',
      user: true,
    })
    expect(response.status).toBe(200)
    expect(response.content).toEqual(target)
  })
})
