/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test } from '@oclif/test'
import fs from 'fs'
import { ExportAccountResponse } from 'ironfish/src'
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
  const writeFileSync = jest.fn<
    void,
    [
      path: number | fs.PathLike,
      data: string | NodeJS.ArrayBufferView,
      options?: fs.WriteFileOptions | undefined,
    ]
  >()

  beforeAll(() => {
    jest.doMock('ironfish', () => {
      const originalModule = jest.requireActual('ironfish')
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
        writeFileSync,
      }
      return module
    })
  })

  afterAll(() => {
    jest.dontMock('ironfish')
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

  describe('with a path argument', () => {
    const path = 'foo.txt'

    test
      .stdout()
      .command(['accounts:export', 'default', path])
      .exit(0)
      .it('writes the account to the provided path', () => {
        expect(writeFileSync).toHaveBeenCalledTimes(1)
        expect(writeFileSync.mock.calls[0][0]).toBe(path)
        expect(JSON.parse(writeFileSync.mock.calls[0][1].toString())).toMatchObject(
          responseContent.account,
        )
      })
  })
})
