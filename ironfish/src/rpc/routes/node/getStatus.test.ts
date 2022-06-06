/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route node/getStatus', () => {
  const routeTest = createRouteTest()

  it('should get status', async () => {
    const response = await routeTest.adapter.request('node/getStatus')

    expect(response.status).toBe(200)

    expect(response.content).toMatchObject({
      node: {
        status: 'stopped',
      },
      memory: {
        heapUsed: expect.any(Number),
        rss: expect.any(Number),
      },
      miningDirector: {
        status: 'started',
      },
      blockSyncer: {
        status: 'stopped',
      },
    })
  })
})
