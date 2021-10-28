/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { mockHostsStore } from '../testUtilities'
import { PeerAddressManager } from './peerAddressManager'

jest.useFakeTimers()

describe('PeerAddressManager', () => {
  it('constructor load hosts from HostsStore', () => {
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    expect(peerAddressManager.addrs).toMatchObject([
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ])
  })

  it('getPeerAddr should return a randomly-sampled PeerAddress', () => {
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    for (let i = 0; i < 10; i++) {
      peerAddressManager.addrs.push({ address: `${i}.${i}.${i}.${i}`, port: i })
    }
    const sample = peerAddressManager.getPeerAddr()
    expect(peerAddressManager.addrs).toContainEqual(sample)
  })
})
