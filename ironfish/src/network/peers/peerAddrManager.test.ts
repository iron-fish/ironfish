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

  it('createPeerAddr should create PeerAddr from peer details', () => {
    const peerAddrManager = new PeerAddrManager(mockHostsStore())
    peerAddrManager.createPeerAddr('1.1.1.1', 1111)
    expect(peerAddrManager.addrs).toContainEqual({
      address: '1.1.1.1',
      port: 1111,
      identity: undefined,
      inUse: false,
    })
  })

  it('getPeerAddr should return a randomly-sampled PeerAddr', () => {
    const peerAddrManager = new PeerAddrManager(mockHostsStore())
    for (let i = 0; i < 10; i++) {
      peerAddrManager.createPeerAddr(`${i}.${i}.${i}.${i}`, i)
    }
    const sample = peerAddrManager.getPeerAddr()
    expect(peerAddrManager.addrs).toContainEqual(sample)
  })

  it('save should save host information to hostsStore', async () => {
    const peerAddrManager = new PeerAddrManager(mockHostsStore())
    for (let i = 0; i < 10; i++) {
      peerAddrManager.createPeerAddr(`${i}.${i}.${i}.${i}`, i, undefined, i < 5)
    }
    await peerAddrManager.save()
    peerAddrManager.hostsStore
      .getArray('hosts')
      .forEach((addr) => expect(addr.inUse).toBeTruthy())
  })
})
