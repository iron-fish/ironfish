/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect as expectCli, test } from '@oclif/test'
import { GetAccountsResponse } from 'ironfish'

describe('accounts:list', () => {
  const responseContent: GetAccountsResponse = {
    accounts: ['default', 'foo', 'bar'],
  }

  beforeAll(() => {
    jest.doMock('ironfish', () => {
      const originalModule = jest.requireActual('ironfish')
      const client = {
        connect: jest.fn(),
        getAccounts: jest.fn().mockImplementation(() => ({
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

  describe('fetching all accounts', () => {
    test
      .stdout()
      .command('accounts:list')
      .exit(0)
      .it('logs all account names', (ctx) => {
        expectCli(ctx.stdout).include(responseContent.accounts.join('\n'))
      })
  })
})
