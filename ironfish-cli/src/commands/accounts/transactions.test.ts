/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetAccountTransactionResponse, GetAccountTransactionsResponse } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:transactions', () => {
  const account = 'default'
  const transactionHash = '1fa5f38c446e52f8842d8c861507744fc3f354992610e1661e033ef316e2d3d1'

  const responseContentTransactions: GetAccountTransactionsResponse = {
    account,
    transactions: [
      {
        creator: true,
        status: 'completed',
        hash: '1fa5f38c446e52f8842d8c861507744fc3f354992610e1661e033ef316e2d3d1',
        isMinersFee: false,
        fee: 0.1,
        notes: 1,
        spends: 1,
      },
    ],
  }

  const responseContentTransaction: GetAccountTransactionResponse = {
    account,
    transactionHash,
    transactionInfo: {
      status: 'completed',
      isMinersFee: false,
      fee: 0.1,
      notes: 1,
      spends: 1,
    },
    transactionNotes: [
      {
        spender: true,
        amount: 1,
        memo: 'foo',
      },
    ],
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        connect: jest.fn(),
        getAccountTransactions: jest.fn().mockImplementation(() => ({
          content: responseContentTransactions,
        })),
        getAccountTransaction: jest.fn().mockImplementation(() => ({
          content: responseContentTransaction,
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

  describe('fetching transactions for an account', () => {
    test
      .stdout()
      .command(['accounts:transactions', `-a ${account}`])
      .exit(0)
      .it('logs the transactions for the given account', (ctx) => {
        expectCli(ctx.stdout).include(responseContentTransactions.account)
        expectCli(ctx.stdout).include(
          responseContentTransactions.transactions[0].creator ? `✔` : `x`,
        )
        expectCli(ctx.stdout).include(responseContentTransactions.transactions[0].status)
        expectCli(ctx.stdout).include(responseContentTransactions.transactions[0].hash)
        expectCli(ctx.stdout).include(
          responseContentTransactions.transactions[0].isMinersFee ? `✔` : `x`,
        )
        expectCli(ctx.stdout).include(responseContentTransactions.transactions[0].fee)
        expectCli(ctx.stdout).include(responseContentTransactions.transactions[0].notes)
        expectCli(ctx.stdout).include(responseContentTransactions.transactions[0].spends)
      })
  })

  describe('fetching details of specific transaction', () => {
    test
      .stdout()
      .command(['accounts:transactions', `-t ${transactionHash}`])
      .exit(0)
      .it('logs the transaction details and notes for the given hash', (ctx) => {
        expectCli(ctx.stdout).include(responseContentTransaction.account)
        expectCli(ctx.stdout).include(responseContentTransaction.transactionHash)

        // transaction details
        expectCli(ctx.stdout).include(responseContentTransaction.transactionInfo?.status)
        expectCli(ctx.stdout).include(
          responseContentTransaction.transactionInfo?.isMinersFee ? `✔` : `x`,
        )
        expectCli(ctx.stdout).include(responseContentTransaction.transactionInfo?.fee)
        expectCli(ctx.stdout).include(responseContentTransaction.transactionInfo?.notes)
        expectCli(ctx.stdout).include(responseContentTransaction.transactionInfo?.spends)

        // transaction notes
        expectCli(ctx.stdout).include(
          responseContentTransaction.transactionNotes[0].spender ? `✔` : `x`,
        )
        expectCli(ctx.stdout).include(responseContentTransaction.transactionNotes[0].amount)
        expectCli(ctx.stdout).include(responseContentTransaction.transactionNotes[0].memo)
      })
  })
})
