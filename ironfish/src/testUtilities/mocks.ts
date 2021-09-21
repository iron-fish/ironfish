/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

export function mockEvent(): any {
  return { on: jest.fn() }
}

export function mockAccounts(): any {
  return {
    onBroadcastTransaction: mockEvent(),
    syncTransaction: jest.fn(),
  }
}

export function mockChain(): any {
  return {
    head: { hash: 'mockhash', sequence: 1, work: BigInt(0) },
    synced: true,
  }
}

export function mockStrategy(): any {
  return {}
}

export function mockNode(): any {
  return {
    accounts: mockAccounts(),
    memPool: mockMempool(),
    miningDirector: mockDirector(),
    syncer: mockSyncer(),
    workerPool: mockWorkerPool(),
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

function mockMempool(): unknown {
  return {
    acceptTransaction: jest.fn(),
  }
}

export function mockSyncer(): any {
  return {
    addNewBlock: jest.fn(),
  }
}

function mockWorkerPool(): unknown {
  return {
    saturated: jest.fn(),
  }
}
