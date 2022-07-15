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

  describe('if a rescan is already running', () => {
    it('returns a bad request status code', async () => {
      const scan = new ScanState()
      routeTest.node.accounts.scan = scan

      const response = routeTest.client
        .request<RescanAccountResponse>('account/rescanAccount', {
          follow: false,
        })
        .waitForEnd()

      await expect(response).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rescans transactions', async () => {
      const scan = new ScanState()
      routeTest.node.accounts.scan = scan

      const wait = jest.spyOn(scan, 'wait').mockImplementationOnce(async () => {})

      await routeTest.client
        .request<RescanAccountResponse>('account/rescanAccount', {
          follow: true,
        })
        .waitForEnd()

      expect(wait).toHaveBeenCalledTimes(1)
    })

    it('returns a 200 status code', async () => {
      const scan = new ScanState()
      routeTest.node.accounts.scan = scan

      jest.spyOn(scan, 'wait').mockImplementationOnce(async () => {})

      const response = await routeTest.client
        .request<RescanAccountResponse>('account/rescanAccount', {
          follow: true,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
    })
  })

  it('scans transactions on the accounts', async () => {
    const scanTransactions = jest
      .spyOn(routeTest.node.accounts, 'scanTransactions')
      .mockReturnValue(Promise.resolve())

    const response = await routeTest.client
      .request<RescanAccountResponse>('account/rescanAccount', {
        follow: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(scanTransactions).toHaveBeenCalledTimes(1)
  })

  it('resets the accounts', async () => {
    const reset = jest
      .spyOn(routeTest.node.accounts, 'reset')
      .mockReturnValue(Promise.resolve())

    const scanTransactions = jest
      .spyOn(routeTest.node.accounts, 'scanTransactions')
      .mockReturnValue(Promise.resolve())

    await routeTest.client
      .request<RescanAccountResponse>('account/rescanAccount', {
        follow: false,
        reset: true,
      })
      .waitForEnd()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(scanTransactions).toHaveBeenCalledTimes(1)
  })
})
