/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

jest.mock('axios')

describe('Route config/unsetConfig', () => {
  const routeTest = createRouteTest()

  it('should error if the config name does not exist', async () => {
    await expect(routeTest.client.config.unsetConfig({ name: 'asdf' })).rejects.toThrow()
  })

  it('handles clear values values', async () => {
    routeTest.sdk.config.set('blockGraffiti', 'bar')
    routeTest.sdk.config.setOverride('blockGraffiti', 'foo')
    expect(routeTest.sdk.config.get('blockGraffiti')).toEqual('foo')

    await routeTest.client.config.unsetConfig({
      name: 'blockGraffiti',
    })

    expect(routeTest.sdk.config.get('blockGraffiti')).toEqual('')
  })
})
