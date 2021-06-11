/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../../../testUtilities/routeTest'
import { getAccount, runRescan } from './utils'
import { ScanState } from '../../../account'
import { ValidationError } from '../../adapters'
import { Event } from '../../../event'

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

  describe('runRescan', () => {
    const routeTest = createRouteTest()
    const stream = jest.fn()

    afterEach(() => {
      routeTest.node.accounts.scan = null
    })

    describe('if a rescan is already running', () => {
      it('throws a ValidationError', async () => {
        const { node } = routeTest
        jest.spyOn(node.accounts, 'getScan').mockImplementationOnce(() => new ScanState())

        await expect(runRescan(node, false, false, stream)).rejects.toThrow(ValidationError)
      })
    })

    describe('if a scan state is not set', () => {
      describe('if the reset flag is set', () => {
        it('resets the accounts', async () => {
          const { node } = routeTest
          const reset = jest.spyOn(node.accounts, 'reset')

          await runRescan(node, false, true, stream)
          expect(reset).toHaveBeenCalledTimes(1)
        })
      })

      it('scans transactions on the accounts', async () => {
        const { node } = routeTest
        const scanTransactions = jest.spyOn(node.accounts, 'scanTransactions')

        await runRescan(node, false, true, stream)
        expect(scanTransactions).toHaveBeenCalledTimes(1)
      })
    })

    describe('when follow is set', () => {
      it('rescans transactions', async () => {
        const { node } = routeTest
        const scan = new ScanState()
        node.accounts.scan = scan
        const wait = jest.spyOn(scan, 'wait').mockImplementationOnce(() => null!)

        await runRescan(node, true, false, stream)
        expect(wait).toHaveBeenCalledTimes(1)
      })

      describe('if a close callback is provided', () => {
        it('stops listening to transactions', async () => {
          const onClose = new Event<[]>()
          const { node } = routeTest
          const scan = new ScanState()
          node.accounts.scan = scan
          jest.spyOn(scan, 'wait').mockImplementationOnce(() => null!)
          const off = jest.spyOn(scan.onTransaction, 'off')

          await runRescan(node, true, false, stream, onClose)
          onClose.emit()
          expect(off).toHaveBeenCalledTimes(1)
        })
      })
    })
  })
})
