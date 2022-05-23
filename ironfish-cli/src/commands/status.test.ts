/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetStatusResponse } from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'

describe('status', () => {
  const responseContent: GetStatusResponse = {
    peerNetwork: { peers: 0, isReady: false, inboundTraffic: 0, outboundTraffic: 0 },
    blockchain: {
      synced: true,
      head: '123',
    },
    node: {
      status: 'started',
      version: '0.0.0',
      git: 'src',
    },
    memory: {
      heapTotal: 2,
      heapUsed: 1,
      rss: 3,
      memFree: 4,
      memTotal: 10,
    },
    miningDirector: { status: 'started', miners: 0, blocks: 0 },
    memPool: { size: 0 },
    blockSyncer: { status: 'stopped', syncing: { blockSpeed: 0, speed: 0, progress: 0 } },
    telemetry: { status: 'stopped', pending: 0, submitted: 0 },
    workers: {
      started: true,
      workers: 1,
      executing: 0,
      queued: 0,
      capacity: 1,
      change: 0,
      speed: 0,
    },
  }

  beforeAll(() => {
    jest.doMock('@ironfish/sdk', () => {
      const originalModule = jest.requireActual('@ironfish/sdk')
      const client = {
        connect: jest.fn(),
        status: jest.fn().mockImplementation(() => ({
          content: responseContent,
        })),
      }
      const module: typeof jest = {
        ...originalModule,
        IronfishSdk: {
          init: jest.fn().mockImplementation(() => ({
            client,
            clientMemory: client,
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

  describe('it logs out the status of the node', () => {
    test
      .stdout()
      .command(['status'])
      .exit(0)
      .it('logs out data for the chain, node, mempool, and syncer', (ctx) => {
        expectCli(ctx.stdout).include('Version')
        expectCli(ctx.stdout).include('Node')
        expectCli(ctx.stdout).include('Memory')
        expectCli(ctx.stdout).include('P2P Network')
        expectCli(ctx.stdout).include('Mining')
        expectCli(ctx.stdout).include('Mem Pool')
        expectCli(ctx.stdout).include('Syncer')
        expectCli(ctx.stdout).include('Blockchain')
        expectCli(ctx.stdout).include('Telemetry')
        expectCli(ctx.stdout).include('Workers')
      })
  })
})
