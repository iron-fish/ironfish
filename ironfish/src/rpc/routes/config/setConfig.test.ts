/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

jest.mock('axios')

describe('Route config/setConfig', () => {
  const routeTest = createRouteTest()

  it('should error if the config name does not exist', async () => {
    await expect(
      routeTest.adapter.request('config/setConfig', { name: 'asdf', value: 'asdf' }),
    ).rejects.toThrow()
  })

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

    it('should convert strings to arrays', async () => {
      const response = await routeTest.adapter.request('config/setConfig', {
        name: 'bootstrapNodes',
        value: 'test.node.com,test2.node.com',
      })
      const content = await response.content
      expect(response.status).toBe(200)
      expect(content).toBeUndefined()
      expect(routeTest.sdk.config.get('bootstrapNodes')).toEqual([
        'test.node.com',
        'test2.node.com',
      ])
    })

    it('handles single values', async () => {
      const response = await routeTest.adapter.request('config/setConfig', {
        name: 'bootstrapNodes',
        value: 'test.node.com',
      })
      const content = await response.content
      expect(response.status).toBe(200)
      expect(content).toBeUndefined()
      expect(routeTest.sdk.config.get('bootstrapNodes')).toEqual(['test.node.com'])
    })

    it('should strip leading and trailing whitespace', async () => {
      const response = await routeTest.adapter.request('config/setConfig', {
        name: 'bootstrapNodes',
        value: '  node1  ,   node2  ',
      })
      const content = await response.content
      expect(response.status).toBe(200)
      expect(content).toBeUndefined()
      expect(routeTest.sdk.config.get('bootstrapNodes')).toEqual(['node1', 'node2'])
    })

    it('should leave quotes', async () => {
      const response = await routeTest.adapter.request('config/setConfig', {
        name: 'bootstrapNodes',
        value: ' \' node1 \' , " node2 " ',
      })
      const content = await response.content
      expect(response.status).toBe(200)
      expect(content).toBeUndefined()
      expect(routeTest.sdk.config.get('bootstrapNodes')).toEqual(["' node1 '", '" node2 "'])
    })
  })
})
