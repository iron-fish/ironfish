/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetPublicKeyResponse } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:address', () => {
  const publicKeyResponse: GetPublicKeyResponse = {
    account: 'default',
    publicKey:
      '000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')

      const client = {
        connect: jest.fn(),
        getAccountPublicKey: jest.fn().mockImplementation(() => ({
          content: publicKeyResponse,
        })),
      }

      const module: typeof jest = {
        ...originalModule,
        IronfishSdk: {
          init: jest.fn().mockImplementation(() => ({
            client,
            connectRpc: jest.fn().mockResolvedValue(client),
          })),
        },
      }
      return module
    })
  })

  afterAll(() => {
    jest.dontMock('@ironfish/sdk')
  })

  describe('fetching public key', () => {
    test
      .stdout()
      .command('accounts:address')
      .exit(0)
      .it('logs account address', (ctx) => {
        expectCli(ctx.stdout).include(publicKeyResponse.publicKey)
        expectCli(ctx.stdout).include(publicKeyResponse.account)
      })
  })
})
