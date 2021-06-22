/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { Account, ScanState } from '../../../account'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RescanAccountResponse } from './rescanAccount'

describe('account/rescanAccount', () => {
  const routeTest = createRouteTest()
  let account: Account

  beforeEach(async () => {
    jest.spyOn(routeTest.node.accounts, 'updateHead').mockImplementationOnce(async () => {})
    account = await routeTest.node.accounts.createAccount(uuid())
    await routeTest.node.accounts.setDefaultAccount(account.name)
  })

  afterEach(() => {
    routeTest.node.accounts.scan = null
  })

  describe('if a rescan is already running', () => {
    it('returns a bad request status code', async () => {
      const scan = new ScanState()
      routeTest.node.accounts.scan = scan

      try {
        await routeTest.adapter.request<RescanAccountResponse>('account/rescanAccount', {
          follow: false,
        })
      } catch (error) {
        expect(error.status).toBe(400)
      }
    })
  })

  describe('if a scan state is not set', () => {
    describe('if the reset flag is set', () => {
      it('resets the accounts', async () => {
        const { node } = routeTest
        const reset = jest.spyOn(node.accounts, 'reset')

        await routeTest.adapter.request<RescanAccountResponse>('account/rescanAccount', {
          follow: false,
          reset: true,
        })

        expect(reset).toHaveBeenCalledTimes(1)
      })
    })

    it('scans transactions on the accounts', async () => {
      const { node } = routeTest
      const scanTransactions = jest.spyOn(node.accounts, 'scanTransactions')

      await routeTest.adapter.request<RescanAccountResponse>('account/rescanAccount', {
        follow: false,
      })

      expect(scanTransactions).toHaveBeenCalledTimes(1)
    })

    it('returns a 200 status code', async () => {
      const response = await routeTest.adapter.request<RescanAccountResponse>(
        'account/rescanAccount',
        {
          follow: false,
        },
      )

      expect(response.status).toBe(200)
    })
  })

  describe('when follow is set', () => {
    it('rescans transactions', async () => {
      const { node } = routeTest
      const scan = new ScanState()
      node.accounts.scan = scan
      const wait = jest.spyOn(scan, 'wait').mockImplementationOnce(async () => {})

      await routeTest.adapter.request<RescanAccountResponse>('account/rescanAccount', {
        follow: true,
      })

      expect(wait).toHaveBeenCalledTimes(1)
    })

    it('returns a 200 status code', async () => {
      const { node } = routeTest
      const scan = new ScanState()
      node.accounts.scan = scan
      jest.spyOn(scan, 'wait').mockImplementationOnce(async () => {})

      const response = await routeTest.adapter.request<RescanAccountResponse>(
        'account/rescanAccount',
        {
          follow: true,
        },
      )

      expect(response.status).toBe(200)
    })
  })
})
