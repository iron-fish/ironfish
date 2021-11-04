/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { mockHostsStore } from '../testUtilities'
import { AddressManager } from './addressManager'

jest.useFakeTimers()

describe('AddressManager', () => {
  it('constructor loads addresses from HostsStore', () => {
    const addressManager = new AddressManager(mockHostsStore())
    expect(addressManager.priorConnectedPeerAddresses).toMatchObject([
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ])
    expect(addressManager.possiblePeerAddresses).toMatchObject([
      {
        address: '1.1.1.1',
        port: 1111,
        identity: undefined,
      },
    ])
  })
})
