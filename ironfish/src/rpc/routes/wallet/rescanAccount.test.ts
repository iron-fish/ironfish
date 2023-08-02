/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account, ScanState } from '../../../wallet'
import { RescanAccountResponse } from './rescanAccount'

describe('Route wallet/rescanAccount', () => {
  const routeTest = createRouteTest()
  let account: Account

  beforeEach(async () => {
    jest.spyOn(routeTest.node.wallet, 'updateHead').mockImplementationOnce(async () => {})
    account = await routeTest.node.wallet.createAccount(uuid())
    await routeTest.node.wallet.setDefaultAccount(account.name)
  })

  describe('if a rescan is already running', () => {
    it('returns a bad request status code', async () => {
      const scan = new ScanState()
      routeTest.node.wallet.scan = scan

      const response = routeTest.client
        .request<RescanAccountResponse>('wallet/rescanAccount', {
          follow: false,
        })
        .waitForEnd()

      await expect(response).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rescans transactions', async () => {
      const scan = new ScanState()
      routeTest.node.wallet.scan = scan

      const wait = jest.spyOn(scan, 'wait').mockImplementationOnce(async () => {})

      await routeTest.client
        .request<RescanAccountResponse>('wallet/rescanAccount', {
          follow: true,
        })
        .waitForEnd()

      expect(wait).toHaveBeenCalledTimes(1)
    })

    it('returns a 200 status code', async () => {
      const scan = new ScanState()
      routeTest.node.wallet.scan = scan

      jest.spyOn(scan, 'wait').mockImplementationOnce(async () => {})

      const response = await routeTest.client
        .request<RescanAccountResponse>('wallet/rescanAccount', {
          follow: true,
        })
        .waitForEnd()

      expect(response.status).toBe(200)
    })
  })

  it('scans transactions on the accounts', async () => {
    const scanTransactions = jest
      .spyOn(routeTest.node.wallet, 'scanTransactions')
      .mockReturnValue(Promise.resolve())

    const response = await routeTest.client
      .request<RescanAccountResponse>('wallet/rescanAccount', {
        follow: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(scanTransactions).toHaveBeenCalledTimes(1)
  })

  it('resets the accounts', async () => {
    const reset = jest.spyOn(routeTest.node.wallet, 'reset').mockReturnValue(Promise.resolve())

    const scanTransactions = jest
      .spyOn(routeTest.node.wallet, 'scanTransactions')
      .mockReturnValue(Promise.resolve())

    await routeTest.client
      .request<RescanAccountResponse>('wallet/rescanAccount', {
        follow: false,
      })
      .waitForEnd()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(scanTransactions).toHaveBeenCalledTimes(1)
  })

  it('sets account head to one before the request.from sequence', async () => {
    const reset = jest.spyOn(routeTest.node.wallet, 'reset').mockReturnValue(Promise.resolve())

    const chain = routeTest.node.chain

    const block2 = await useMinerBlockFixture(chain, 2)
    await expect(chain).toAddBlock(block2)

    const scanTransactions = jest
      .spyOn(routeTest.node.wallet, 'scanTransactions')
      .mockReturnValue(Promise.resolve())

    const updateHead = jest.spyOn(account, 'updateHead').mockReturnValue(Promise.resolve())

    await routeTest.client
      .request<RescanAccountResponse>('wallet/rescanAccount', {
        follow: false,
        from: 2,
      })
      .waitForEnd()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(updateHead).toHaveBeenCalledWith({
      hash: block2.header.previousBlockHash,
      sequence: 1,
    })
    expect(scanTransactions).toHaveBeenCalledTimes(1)
  })

  it('does not set account head if the request.from sequence is the genesis block', async () => {
    const reset = jest.spyOn(routeTest.node.wallet, 'reset').mockReturnValue(Promise.resolve())

    const scanTransactions = jest
      .spyOn(routeTest.node.wallet, 'scanTransactions')
      .mockReturnValue(Promise.resolve())

    const updateHead = jest.spyOn(account, 'updateHead').mockReturnValue(Promise.resolve())

    await routeTest.client
      .request<RescanAccountResponse>('wallet/rescanAccount', {
        follow: false,
        from: 1,
      })
      .waitForEnd()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(updateHead).not.toHaveBeenCalled()
    expect(scanTransactions).toHaveBeenCalledTimes(1)
  })
})
