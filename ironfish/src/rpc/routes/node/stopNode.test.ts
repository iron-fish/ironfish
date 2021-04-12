/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route node.getStatus', () => {
  const routeTest = createRouteTest()

  it('should get status', async () => {
    routeTest.node.shutdown = jest.fn()

    const response = await routeTest.adapter.request('node/stopNode')
    expect(response.status).toBe(200)
    expect(response.content).toBe(undefined)
    expect(routeTest.node.shutdown).toHaveBeenCalled()
  })
})
