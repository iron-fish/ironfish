/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ExportAccountResponse } from '@ironfish/sdk'
import { test } from '@oclif/test'
import identity from 'lodash/identity'

describe('accounts:export', () => {
  const responseContent: ExportAccountResponse = {
    account: {
      name: 'default',
      spendingKey: 'spending-key',
      incomingViewKey: 'incoming-view-key',
      outgoingViewKey: 'outgoing-view-key',
      publicAddress: 'public-address',
    },
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        connect: jest.fn(),
        exportAccount: jest.fn().mockImplementation(() => ({
          content: responseContent,
        })),
      }
      const module: typeof jest = {
        ...originalModule,
        IronfishSdk: {
          init: jest.fn().mockImplementation(() => ({
            client,
            clientMemory: client,
            node: jest.fn().mockImplementation(() => ({
              openDB: jest.fn(),
            })),
            fileSystem: {
              resolve: identity,
            },
            connectRpc: jest.fn().mockResolvedValue(client),
          })),
        },
      }
      return module
    })

    jest.doMock('fs', () => {
      const originalModule = jest.requireActual('fs')
      const module: typeof jest = {
        ...originalModule,
      }
      return module
    })
  })

  afterAll(() => {
    jest.dontMock('@ironfish/sdk')
    jest.dontMock('fs')
  })

  describe('with no flags', () => {
    test
      .stdout()
      .command(['accounts:export', 'default'])
      .exit(0)
      .it('logs the account to stdout', (ctx) => {
        expect(JSON.parse(ctx.stdout)).toMatchObject(responseContent.account)
      })
  })

  describe('with the local flag', () => {
    test
      .stdout()
      .command(['accounts:export', '--local', 'default'])
      .exit(0)
      .it('logs the account to stdout', (ctx) => {
        expect(JSON.parse(ctx.stdout)).toMatchObject(responseContent.account)
      })
  })
})
