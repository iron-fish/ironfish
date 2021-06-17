/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../../../testUtilities/routeTest'
import { getAccount } from './utils'

describe('Accounts utils', () => {
  describe('getAccount', () => {
    const routeTest = createRouteTest()
    const name = 'testAccount'
    let publicAddress = ''

    beforeAll(async () => {
      const account = await routeTest.node.accounts.createAccount(name)
      publicAddress = account.publicAddress
    })

    it('should fail if account is not found with name', () => {
      expect(() => {
        getAccount(routeTest.node, 'badAccount')
      }).toThrow('No account with name')
    })

    it('should pass if account is found with name', () => {
      const result = getAccount(routeTest.node, name)
      expect(result.name).toEqual(name)
      expect(result.publicAddress).toEqual(publicAddress)
    })

    it('should fail if no default account account is set', async () => {
      await routeTest.node.accounts.setDefaultAccount(null)

      expect(() => {
        getAccount(routeTest.node)
      }).toThrow('No account is currently active')
    })

    it('should pass if default account is found', async () => {
      await routeTest.node.accounts.setDefaultAccount(name)
      const result = getAccount(routeTest.node)
      expect(result.name).toEqual(name)
      expect(result.publicAddress).toEqual(publicAddress)
    })
  })
})
