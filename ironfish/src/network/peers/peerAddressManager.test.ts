/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import {
  getConnectedPeer,
  getConnectingPeer,
  getDisconnectedPeer,
  mockHostsStore,
  mockLocalPeer,
} from '../testUtilities'
import { Peer } from './peer'
import { PeerAddress } from './peerAddress'
import { PeerAddressManager } from './peerAddressManager'
import { PeerManager } from './peerManager'

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
    const allPeerAddresses: PeerAddress[] = []
    const allPeers: Peer[] = []
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    const pm = new PeerManager(mockLocalPeer(), peerAddressManager)
    const { peer: connectedPeer } = getConnectedPeer(pm)
    const { peer: connectingPeer } = getConnectingPeer(pm)
    const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
    for (const peer of [connectedPeer, connectingPeer, disconnectedPeer]) {
      allPeers.push(peer)
      allPeerAddresses.push({
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity,
      })
    }
    peerAddressManager.addrs = allPeerAddresses
    const sample = peerAddressManager.getRandomDisconnectedPeer(allPeers)
    expect(allPeerAddresses).toContainEqual(sample)
    expect(sample.address).toEqual(disconnectedPeer.address)
    expect(sample.port).toEqual(disconnectedPeer.port)
  })
})
