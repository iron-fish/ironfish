/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

//jest.mock('axios')

describe('Route config/getConfig', () => {
  const routeTest = createRouteTest()

  it('should error if the config name does not exist', async () => {
    await expect(
      routeTest.adapter.request('config/getConfig', { name: 'asdf' }),
    ).rejects.toThrow()
  })

  it('test2', async () => {
    await expect(
      routeTest.adapter.request('config/getConfig', { name: 'minerBatchSize', user: true }),
    ).resolves //.not.toThrow()
  })

  it('test3', async () => {
    await expect(
      routeTest.adapter.request('config/getConfig', { name: 'blocksPerMessage' }),
    ).resolves //.not.toThrow()
  })

/*
  describe('Convert string to array', () => {
    it('does not special-case brackets', async () => {
      const response = await routeTest.adapter.request('config/setConfig', {
        name: 'bootstrapNodes',
        value: '[]',
      })
      const content = await response.content
      expect(response.status).toBe(200)
      expect(content).toBeUndefined()
      expect(routeTest.sdk.config.get('bootstrapNodes')).toEqual(['[]'])
    })
  })
  */
})
