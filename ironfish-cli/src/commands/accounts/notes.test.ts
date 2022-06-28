/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetAccountNotesResponse } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:notes', () => {
  const responseContent: GetAccountNotesResponse = {
    account: 'default',
    notes: [
      {
        spender: true,
        amount: 1,
        memo: 'foo',
        noteTxHash: '1fa5f38c446e52f8842d8c861507744fc3f354992610e1661e033ef316e2d3d1',
      },
    ],
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        connect: jest.fn(),
        getAccountNotes: jest.fn().mockImplementation(() => ({
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

  describe('fetching the notes for an account', () => {
    test
      .stdout()
      .command(['accounts:notes', 'default'])
      .exit(0)
      .it('logs the notes for the given account', (ctx) => {
        expectCli(ctx.stdout).include(responseContent.account)
        expectCli(ctx.stdout).include(responseContent.notes[0].spender ? `✔` : `x`)
        expectCli(ctx.stdout).include(responseContent.notes[0].amount)
        expectCli(ctx.stdout).include(responseContent.notes[0].memo)
        expectCli(ctx.stdout).include(responseContent.notes[0].noteTxHash)
      })
  })
})
