/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as ironfishmodule from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { expect as expectCli, test } from '@oclif/test'

describe('faucet command', () => {
  let accountName: string | null = null
  const request = jest.fn()
  const createAccount = jest.fn()
  const getFunds = jest.fn()
  const getDefaultAccount = jest.fn()

  const ironFishSdkBackup = ironfishmodule.IronfishSdk.init

  beforeEach(() => {
    getFunds.mockReturnValue(Promise.resolve({ content: { message: 'success' } }))

    getDefaultAccount.mockImplementation(() => {
      return Promise.resolve({ content: { account: { name: accountName } } })
    })

    ironfishmodule.IronfishSdk.init = jest.fn().mockImplementation(() => ({
      config: { get: jest.fn() },
      accounts: { use: jest.fn() },
      connectRpc: jest.fn(() => ({
        request,
        createAccount,
        getFunds,
        getDefaultAccount,
      })),
      client: {
        request,
        createAccount,
        getFunds,
        getDefaultAccount,
      },
    }))
  })

  afterEach(() => {
    createAccount.mockReset()
    getFunds.mockReset()
    getDefaultAccount.mockReset()
    ironfishmodule.IronfishSdk.init = ironFishSdkBackup
  })

  test
    .do(() => {
      accountName = null
    })
    .stub(CliUx.ux, 'prompt', () => async () => await Promise.resolve('nameOfTheAccount'))
    .stdout()
    .command(['faucet', '--force'])
    .exit(0)
    .it('request to create an account if one is not set', (ctx) => {
      expectCli(ctx.stdout).include(
        `You don't have a default account set up yet. Let's create one first`,
      )
      expect(createAccount).toHaveBeenCalledWith({ name: 'nameOfTheAccount', default: true })
    })

  test
    .do(() => {
      accountName = 'myAccount'
    })
    .stub(
      CliUx.ux,
      'prompt',
      () => async () => await Promise.resolve('johann@ironfish.network'),
    )
    .stdout()
    .command(['faucet', '--force'])
    .exit(0)
    .it('request funds and succeed', (ctx) => {
      expectCli(ctx.stdout).include(`Collecting your funds...`)
      expect(createAccount).toHaveBeenCalledTimes(0)
      expect(getFunds).toHaveBeenCalledWith({
        accountName: 'myAccount',
        email: 'johann@ironfish.network',
      })
      expectCli(ctx.stdout).include(
        `Congratulations! The Iron Fish Faucet just added your request to the queue!`,
      )
    })

  test
    .do(() => {
      accountName = 'myAccount'
      getFunds.mockRejectedValue('Error')
    })
    .stub(
      CliUx.ux,
      'prompt',
      () => async () => await Promise.resolve('johann@ironfish.network'),
    )
    .stdout()
    .command(['faucet', '--force'])
    .exit(1)
    .it('request funds and fail', (ctx) => {
      expectCli(ctx.stdout).include(`Collecting your funds...`)
      expect(getFunds).toHaveBeenCalledWith({
        accountName,
        email: 'johann@ironfish.network',
      })
      expectCli(ctx.stdout).include(
        `Unfortunately, the faucet request failed. Please try again later`,
      )
    })
})
