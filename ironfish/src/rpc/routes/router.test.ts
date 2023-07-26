/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../assert'
import { createRouteTest } from '../../testUtilities/routeTest'

describe('Router', () => {
  const routeTest = createRouteTest()

  it('should use yup schema', async () => {
    const schema = yup.string().default('default')
    const router = routeTest.client.router
    Assert.isNotUndefined(router)
    router.routes.register('foo/bar', schema, (request) => request.end(request.data))

    // should use default value from the schema
    let response = await routeTest.client.request('foo/bar').waitForEnd()
    expect(response.content).toBe('default')

    // should not use the default value from the schema
    response = await routeTest.client.request('foo/bar', 'bar').waitForEnd()
    expect(response.content).toBe('bar')
  })
})
