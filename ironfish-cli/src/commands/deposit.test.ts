/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as ironfishmodule from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { expect as expectCli, test } from '@oclif/test'

describe('deposit command', () => {
  let accountName: string | null = null
  let accountBalance: number | null = null
  let depositAddress: string | null = null
  let blockchainSynced: boolean | null = false
  let graffiti: string | null = null

  const getAccountBalance = jest.fn()
  const getDefaultAccount = jest.fn()
  const getDepositAddress = jest.fn()
  const status = jest.fn()
  const getConfig = jest.fn()
  const findUser = jest.fn()

  const ironFishSdkBackup = ironfishmodule.IronfishSdk.init

  beforeEach(() => {
    getAccountBalance.mockImplementation(() => {
      return Promise.resolve({ content: { confirmed: accountBalance } })
    })
    getDefaultAccount.mockImplementation(() => {
      return Promise.resolve({ content: { account: { name: accountName } } })
    })
    getDepositAddress.mockImplementation(() => {
      return Promise.resolve(depositAddress)
    })
    status.mockImplementation(() => {
      return Promise.resolve({ content: { blockchain: { synced: blockchainSynced } } })
    })
    getConfig.mockImplementation(() => {
      return Promise.resolve({ content: { blockGraffiti: graffiti } })
    })
    findUser.mockResolvedValue('user')

    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        getAccountBalance,
        getDefaultAccount,
        status,
        getConfig,
      }
      const module: typeof jest = {
        ...originalModule,
        IronfishSdk: {
          init: jest.fn().mockImplementation(() => ({
            client,
            clientMemory: client,
            connectRpc: jest.fn().mockResolvedValue(client),
          })),
        },
        WebApi: jest.fn().mockImplementation(() => ({
          getDepositAddress,
          findUser,
        })),
      }
      return module
    })
  })

  afterEach(() => {
    getAccountBalance.mockReset()
    getDefaultAccount.mockReset()
    getDepositAddress.mockReset()
    status.mockReset()
    getConfig.mockReset()
    ironfishmodule.IronfishSdk.init = ironFishSdkBackup
  })

  test
    .do(() => {
      accountName = null
    })
    .stdout()
    .command(['deposit'])
    .exit(1)
    .it('No account name, fail', (ctx) => {
      expectCli(ctx.stdout).include(
        `Error fetching account name. Please use --account or make sure your default account is set properly.`,
      )
    })

  test
    .do(() => {
      accountName = 'myAccount'
      depositAddress = null
    })
    .stdout()
    .command(['deposit'])
    .exit(1)
    .it('No deposit address, fail', (ctx) => {
      expectCli(ctx.stdout).include(`Error fetching deposit address. Please try again later.`)
    })

  test
    .do(() => {
      accountName = 'myAccount'
      depositAddress = 'myAddress'
      blockchainSynced = false
    })
    .stdout()
    .command(['deposit'])
    .exit(1)
    .it('Node not synced, fail', (ctx) => {
      expectCli(ctx.stdout).include(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
    })

  test
    .do(() => {
      accountName = 'myAccount'
      depositAddress = 'myAddress'
      blockchainSynced = true
      graffiti = null
    })
    .stdout()
    .command(['deposit'])
    .exit(1)
    .it('No graffiti found, fail', (ctx) => {
      expectCli(ctx.stdout).include(`No graffiti found. Register at`)
      expectCli(ctx.stdout).include(`then run \`ironfish testnet\` to configure your graffiti`)
    })

  test
    .do(() => {
      accountName = 'myAccount'
      depositAddress = 'myAddress'
      blockchainSynced = true
      graffiti = 'myGraffiti'
      accountBalance = 0
    })
    .stdout()
    .command(['deposit'])
    .exit(1)
    .it('Insufficient balance, fail', (ctx) => {
      expectCli(ctx.stdout).include(`Insufficient balance: 0`)
      expectCli(ctx.stdout).include(`Required:`)
    })

  test
    .do(() => {
      accountName = 'myAccount'
      depositAddress = 'myAddress'
      blockchainSynced = true
      graffiti = 'myGraffiti'
      accountBalance = 100000000
    })
    .stdout()
    .stub(CliUx.ux, 'confirm', () => async () => await Promise.resolve(false))
    .command(['deposit'])
    .exit(0)
    .it('Valid deposit, cancel at end', (ctx) => {
      expectCli(ctx.stdout).include(`You are about to send`)
      expectCli(ctx.stdout).include(`Your remaining balance after this transaction will be`)
      expectCli(ctx.stdout).include(`This action is NOT reversible`)
      expectCli(ctx.stdout).include(`Transaction aborted`)
    })
})
