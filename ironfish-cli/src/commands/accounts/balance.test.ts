/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect as expectCli, test } from '@oclif/test'
import { displayIronAmountWithCurrency, GetBalanceResponse, oreToIron } from 'ironfish'

describe('accounts:balance', () => {
  const confirmedBalance = '5'
  const unconfirmedBalance = '10'
  const responseContent: GetBalanceResponse = {
    confirmedBalance,
    unconfirmedBalance,
  }

  beforeAll(() => {
    jest.doMock('ironfish', () => {
      const originalModule = jest.requireActual('ironfish')
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
            client,
          })),
        },
      }
      return module
    })
  })

  afterAll(() => {
    jest.dontMock('ironfish')
  })

  describe('fetching the balance for an account', () => {
    test
      .stdout()
      .command(['accounts:balance', 'default'])
      .exit(0)
      .it('logs the account balance and available spending balance', (ctx) => {
        const expectedOutput =
          `The account balance is: ${displayIronAmountWithCurrency(
            oreToIron(Number(unconfirmedBalance)),
            true,
          )}\n` +
          `Amount available to spend: ${displayIronAmountWithCurrency(
            oreToIron(Number(confirmedBalance)),
            true,
          )}`

        expectCli(ctx.stdout).include(expectedOutput)
      })
  })
})
