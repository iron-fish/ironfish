/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { mockHostsStore } from '../testUtilities'
import { PeerAddressManager } from './peerAddressManager'

jest.useFakeTimers()

describe('PeerAddressManager', () => {
  it('constructor loads addresses from HostsStore', () => {
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    expect(peerAddressManager.priorConnectedPeerAddresses).toMatchObject([
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ])
    expect(peerAddressManager.possiblePeerAddresses).toMatchObject([
      {
        address: '1.1.1.1',
        port: 1111,
        identity: undefined,
      },
    ])
  })
})
