/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../test'
import { LogLevel } from 'consola'

describe('Route node/getLogStream', () => {
  const routeTest = createRouteTest()

  it('should get stream log', async () => {
    // Clear out the console reporter
    routeTest.node.logger.setReporters([])
    // Start accepting logs again
    routeTest.node.logger.resume()

    const response = await routeTest.adapter.requestStream('node/getLogStream').waitForRoute()

    routeTest.node.logger.info('Hello', { foo: 2 })
    const { value } = await response.contentStream().next()

    response.end()
    expect(response.status).toBe(200)

    expect(value).toMatchObject({
      level: LogLevel.Info.toString(),
      tag: expect.stringContaining('ironfishnode'),
      type: 'info',
      args: ['Hello', { foo: 2 }],
      date: expect.anything(),
    })
  })
})
