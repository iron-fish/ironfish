/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { displayIronAmountWithCurrency, GetBalanceResponse, oreToIron } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:balance', () => {
  const responseContent: GetBalanceResponse = {
    account: 'default',
    confirmed: '5',
    unconfirmed: '10',
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        connect: jest.fn(),
        getAccountBalance: jest.fn().mockImplementation(() => ({
          content: responseContent,
        })),
      }
      const module: typeof jest = {
        ...originalModule,
        IronfishSdk: {
          init: jest.fn().mockImplementation(() => ({
            connectRpc: jest.fn().mockResolvedValue(client),
            client,
          })),
        },
      }
      return module
    })
  })

  afterAll(() => {
    jest.dontMock('@ironfish/sdk')
  })

  describe('fetching the balance for an account', () => {
    test
      .stdout()
      .command(['accounts:balance', 'default'])
      .exit(0)
      .it('logs the account balance and available spending balance', (ctx) => {
        expectCli(ctx.stdout).include(responseContent.account)

        expectCli(ctx.stdout).include(
          displayIronAmountWithCurrency(oreToIron(Number(responseContent.unconfirmed)), true),
        )

        expectCli(ctx.stdout).include(
          displayIronAmountWithCurrency(oreToIron(Number(responseContent.confirmed)), true),
        )
      })
  })
})
