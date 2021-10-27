/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { mockHostsStore } from '../testUtilities'
import { PeerAddrManager } from './peerAddrManager'

jest.useFakeTimers()

describe('PeerAddrManager', () => {
  it('constructor load hosts from HostsStore', () => {
    const peerAddrManager = new PeerAddrManager(mockHostsStore())
    expect(peerAddrManager.addrs).toMatchObject([
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ])
  })

  it('getPeerAddr should return a randomly-sampled PeerAddr', () => {
    const peerAddrManager = new PeerAddrManager(mockHostsStore())
    for (let i = 0; i < 10; i++) {
      peerAddrManager.addrs.push({ address: `${i}.${i}.${i}.${i}`, port: i })
    }
    const sample = peerAddrManager.getPeerAddr()
    expect(peerAddrManager.addrs).toContainEqual(sample)
  })
})
