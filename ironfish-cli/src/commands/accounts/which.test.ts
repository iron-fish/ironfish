/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as ironfish from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:which', () => {
  let getAccounts: jest.Mock<ironfish.GetAccountsResponse, [ironfish.GetAccountsRequest]>
  const name = 'default'

  beforeEach(() => {
    ironfish.IronfishSdk.init = jest.fn().mockImplementationOnce(() => {
      const client = {
        connect: jest.fn(),
        getAccounts,
      }

      return {
        client: client,
        connectRpc: jest.fn().mockResolvedValue(client),
      }
    })
  })

  describe('without a default account', () => {
    beforeEach(() => {
      getAccounts = jest.fn().mockImplementationOnce(() => ({ content: { accounts: [] } }))
    })

    test
      .stdout()
      .command(['accounts:which'])
      .exit(0)
      .it('logs out no accounts are used', (ctx) => {
        expect(getAccounts).toHaveBeenCalledTimes(1)
        ironfish.Assert.isNotUndefined(getAccounts.mock.calls[0][0])
        expect(getAccounts.mock.calls[0][0].default).toBe(true)
        expectCli(ctx.stdout).include('There is currently no account being used')
      })
  })

  describe('with a default account', () => {
    beforeEach(() => {
      getAccounts = jest.fn().mockImplementationOnce(() => ({ content: { accounts: [name] } }))
    })

    test
      .stdout()
      .command(['accounts:which'])
      .exit(0)
      .it('logs out the default account name', (ctx) => {
        expect(getAccounts).toHaveBeenCalledTimes(1)
        ironfish.Assert.isNotUndefined(getAccounts.mock.calls[0][0])
        expect(getAccounts.mock.calls[0][0].default).toBe(true)
        expectCli(ctx.stdout).include(name)
      })
  })
})
