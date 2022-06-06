/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetWorkersStatusRequest } from './getStatus'

describe('Route worker/getStatus', () => {
  const routeTest = createRouteTest()

  it('should get status', async () => {
    const request: GetWorkersStatusRequest = { stream: false }
    const response = await routeTest.adapter.request('worker/getStatus', { request })

    expect(response.status).toBe(200)

    expect(response.content).toMatchObject({
      started: false,
      workers: 0,
      queued: 0,
      capacity: 0,
      executing: 0,
      change: 0,
      speed: 0,
    })
  })
})
