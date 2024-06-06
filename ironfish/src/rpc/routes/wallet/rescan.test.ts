/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { ScanState } from '../../../wallet/scanner/scanState'

describe('Route wallet/rescan', () => {
  const routeTest = createRouteTest()
  let account: Account

  beforeEach(async () => {
    jest
      .spyOn(routeTest.node.wallet, 'scan')
      .mockImplementationOnce(async () => Promise.resolve(null))

    account = await routeTest.node.wallet.createAccount(uuid())
    await routeTest.node.wallet.setDefaultAccount(account.name)
  })

  it('aborts existing scan if already running', async () => {
    const head = await routeTest.node.wallet.getChainHead()
    const scan = new ScanState(head, head)
    routeTest.node.wallet.scanner.state = scan

    const abortSpy = jest.spyOn(scan, 'abort').mockImplementationOnce(() => {
      routeTest.node.wallet.scanner.state = null
      return Promise.resolve()
    })

    const response = await routeTest.client.wallet.rescan({ follow: true }).waitForEnd()
    expect(response.status).toBe(200)
    expect(abortSpy).toHaveBeenCalledTimes(1)
  })

  it('scans transactions on the accounts', async () => {
    const scanSpy = jest
      .spyOn(routeTest.node.wallet, 'scan')
      .mockReturnValue(Promise.resolve(null))

    const response = await routeTest.client.wallet.rescan({ follow: false }).waitForEnd()

    expect(response.status).toBe(200)
    expect(scanSpy).toHaveBeenCalledTimes(1)
  })

  it('resets the accounts', async () => {
    const resetSpy = jest
      .spyOn(routeTest.node.wallet, 'resetAccounts')
      .mockReturnValue(Promise.resolve())

    const scanSpy = jest
      .spyOn(routeTest.node.wallet, 'scan')
      .mockReturnValue(Promise.resolve(null))

    await routeTest.client.wallet.rescan({ follow: false }).waitForEnd()

    expect(resetSpy).toHaveBeenCalledTimes(1)
    expect(scanSpy).toHaveBeenCalledTimes(1)
  })
})
