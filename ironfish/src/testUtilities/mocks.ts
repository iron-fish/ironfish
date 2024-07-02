/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event } from '../event'
import { Block } from '../primitives/block'
import { IDatabaseTransaction } from '../storage'

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export function mockTransaction(): any {
  return {
    unsignedHash: jest.fn().mockReturnValue(Buffer.alloc(32, 'unsignedHash')),
    hash: jest.fn().mockReturnValue(Buffer.alloc(32, 'hash')),
  }
}

export function mockEvent(): any {
  return { on: jest.fn() }
}

export function mockWallet(): any {
  return {
    onBroadcastTransaction: mockEvent(),
  }
}

export function mockVerifier(): any {
  return {
    verifyNewTransaction: jest.fn<(...args: any[]) => Promise<object>>().mockResolvedValue({}),
  }
}

export function mockChain(): any {
  return {
    verifier: mockVerifier(),
    head: { hash: 'mockhash', sequence: 1, work: BigInt(0) },
    synced: true,
    onConnectBlock: new Event<[block: Block, tx?: IDatabaseTransaction]>(),
    onDisconnectBlock: new Event<[block: Block, tx?: IDatabaseTransaction]>(),
    onForkBlock: new Event<[block: Block, tx?: IDatabaseTransaction]>(),
    genesis: { hash: Buffer.alloc(32, 0), sequence: 1, work: BigInt(0) },
  }
}

export function mockNode(): any {
  return {
    wallet: mockWallet(),
    memPool: mockMempool(),
    miningDirector: mockDirector(),
    miningManager: mockMiningManager(),
    syncer: mockSyncer(),
    workerPool: mockWorkerPool(),
    chain: mockChain(),
  }
}

export function mockPeerNetwork(): any {
  return {}
}

export function mockDirector(): any {
  return {
    onNewBlock: mockEvent(),
  }
}

export function mockMiningManager(): any {
  return {
    onNewBlock: mockEvent(),
  }
}

function mockMempool(): unknown {
  return {
    acceptTransaction: jest.fn(),
    exists: jest.fn().mockReturnValue(false),
  }
}

export function mockSyncer(): any {
  return {
    addNewBlock: jest.fn(),
  }
}

export function mockLogger(): any {
  return {
    debug: jest.fn(),
    error: jest.fn(),
  }
}

export function mockTelemetry(): any {
  return {}
}

export function mockWorkerPool(): any {
  return {
    saturated: jest.fn(),
    submitTelemetry: jest.fn(),
  }
}

export function mockConfig(values: Record<string, any>): any {
  return {
    get: jest.fn((x: string) => values[x]),
  }
}
