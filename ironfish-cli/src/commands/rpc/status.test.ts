/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetRpcStatusResponse } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('rpc:status', () => {
  const rpcStatusResponse: GetRpcStatusResponse = {
    started: true,
    adapters: [
      {
        name: 'adapter1',
        inbound: 1,
        outbound: 2,
        readableBytes: 1024,
        writableBytes: 2048,
        readBytes: 3072,
        writtenBytes: 4096,
        clients: 10,
        pending: 5,
      },
    ],
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')

      const client = {
        connect: jest.fn(),
        getRpcStatus: jest.fn().mockImplementation(() => ({
          content: rpcStatusResponse,
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

  describe('fetch rpc status', () => {
    test
      .stdout()
      .command('rpc:status')
      .exit(0)
      .it('logs if rpc started', (ctx) => {
        const stdout = ctx.stdout.replace(/\s+/g, ' ').trim()

        expectCli(stdout).include('STARTED: true')
        expectCli(stdout).include('[adapter1]')
        expectCli(stdout).include('Clients: 10')
        expectCli(stdout).include('Requests Pending: 5')
        expectCli(stdout).include('Inbound Traffic: 1 B/s')
        expectCli(stdout).include('Outbound Traffic: 2 B/s')
        expectCli(stdout).include('Outbound Total: 4.00 KiB')
        expectCli(stdout).include('Inbound Total: 3.00 KiB')
        expectCli(stdout).include('RW Backlog: 1.00 KiB / 2.00 KiB')
      })
  })
})
