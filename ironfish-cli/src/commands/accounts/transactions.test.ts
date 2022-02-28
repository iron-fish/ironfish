/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect as expectCli, test } from '@oclif/test'
import { GetTransactionsResponse } from 'ironfish'

describe('accounts:transactions', () => {
  const responseContent: GetTransactionsResponse = {
    accountName: 'default',
    notes: [
      {
        isSpender: true,
        txHash: '1fa5f38c446e52f8842d8c861507744fc3f354992610e1661e033ef316e2d3d1',
        txFee: '1',
        isMinerFee: false,
        amount: '1',
        memo: 'foo',
      },
    ],
  }

  beforeAll(() => {
    jest.doMock('ironfish', () => {
      const originalModule = jest.requireActual('ironfish')
      const client = {
        connect: jest.fn(),
        getTransactionNotes: jest.fn().mockImplementation(() => ({
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
    jest.dontMock('ironfish')
  })

  describe('fetching the transaction notes for an account', () => {
    test
      .stdout()
      .command(['accounts:transactions', 'default'])
      .exit(0)
      .it('logs the notes for the given account', (ctx) => {
        expectCli(ctx.stdout).include(responseContent.accountName)
        expectCli(ctx.stdout).include(responseContent.notes[0].isSpender ? `✔` : `x`)
        expectCli(ctx.stdout).include(responseContent.notes[0].txHash)
        expectCli(ctx.stdout).include(responseContent.notes[0].txFee)
        expectCli(ctx.stdout).include(responseContent.notes[0].isMinerFee ? `✔` : `x`)
        expectCli(ctx.stdout).include(responseContent.notes[0].amount)
        expectCli(ctx.stdout).include(responseContent.notes[0].memo)
      })
  })
})
