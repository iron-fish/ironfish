/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect as expectCli, test } from '@oclif/test'

describe('accounts:rescan', () => {
  const contentStream = jest.fn().mockImplementation(function* () {
    yield 0
  })

  beforeAll(() => {
    jest.mock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        connect: jest.fn(),
        rescanAccountStream: jest.fn().mockImplementation(() => ({
          contentStream,
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
            connectRpc: jest.fn().mockResolvedValue(client),
          })),
        },
      }
      return module
    })
  })

  afterAll(() => {
    jest.unmock('@ironfish/sdk')
  })

  describe('with no flags', () => {
    test
      .stdout()
      .command(['accounts:rescan'])
      .exit(0)
      .it('fetches sequences from the client and scans successfully', (ctx) => {
        expect(contentStream).toHaveBeenCalled()
        expectCli(ctx.stdout).include('Scanning Complete')
      })
  })

  describe('with the local flag', () => {
    test
      .stdout()
      .command(['accounts:rescan', '--local'])
      .exit(0)
      .it('fetches sequences from the node and scans successfully', (ctx) => {
        expect(contentStream).toHaveBeenCalled()
        expectCli(ctx.stdout).include('Scanning Complete')
      })
  })
})
