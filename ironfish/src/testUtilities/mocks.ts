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
  }
}

export function mockNode(): any {
  return {
    accounts: mockAccounts(),
    miningDirector: mockDirector(),
  }
}

export function mockCaptain(): any {
  return {}
}

export function mockPeerNetwork(): any {
  return {
    requestBlocks: jest.fn(),
  }
}

export function mockDirector(): any {
  return {
    onNewBlock: mockEvent(),
  }
}
