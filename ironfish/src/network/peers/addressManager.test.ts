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
import { AddressManager } from './addressManager'
import { Peer } from './peer'
import { PeerAddress } from './peerAddress'
import { PeerManager } from './peerManager'

jest.useFakeTimers()

describe('AddressManager', () => {
  it('constructor loads addresses from HostsStore', () => {
    const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
    const addressManager = new AddressManager(mockHostsStore(), pm)
    addressManager.hostsStore = mockHostsStore()
    expect(addressManager.priorConnectedPeerAddresses).toMatchObject([
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ])
  })

  it('removePeerAddress should remove a peer address', () => {
    const hostsStore = mockHostsStore()
    const localPeer = mockLocalPeer()
    const pm = new PeerManager(localPeer, hostsStore)
    const addressManager = new AddressManager(hostsStore, pm)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
    const { peer: peer1 } = getConnectedPeer(pm)
    addressManager.addPeer(peer1)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(2)
    addressManager.removePeer(peer1)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
  })

  it('getRandomDisconnectedPeer should return a randomly-sampled disconnected peer', () => {
    const now = Date.now()
    Date.now = jest.fn(() => now)

    const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
    const addressManager = new AddressManager(mockHostsStore(), pm)
    addressManager.hostsStore = mockHostsStore()
    const { peer: connectedPeer } = getConnectedPeer(pm)
    const { peer: connectingPeer } = getConnectingPeer(pm)
    const disconnectedPeer = getDisconnectedPeer(pm)
    const nonDisconnectedPeers: Peer[] = [connectedPeer, connectingPeer]

    for (const peer of [...nonDisconnectedPeers, disconnectedPeer]) {
      addressManager.addPeer(peer)
    }

    const nonDisconnectedIdentities = nonDisconnectedPeers.flatMap((peer) => {
      if (peer.state.type !== 'DISCONNECTED' && peer.state.identity !== null) {
        return peer.state.identity
      } else {
        return []
      }
    })

    const sample = addressManager.getRandomDisconnectedPeerAddress(nonDisconnectedIdentities)
    expect(sample).not.toBeNull()
    if (sample !== null) {
      expect(addressManager.priorConnectedPeerAddresses).toContainEqual(sample)
      expect(sample.address).toEqual(disconnectedPeer.address)
      expect(sample.port).toEqual(disconnectedPeer.port)
    }
  })

  describe('save', () => {
    it('save should persist connected peers', () => {
      // mock Date.now()
      const now = Date.now()
      Date.now = jest.fn(() => now)

      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      const addressManager = new AddressManager(mockHostsStore(), pm)
      addressManager.hostsStore = mockHostsStore()
      const { peer: connectedPeer } = getConnectedPeer(pm)
      getConnectingPeer(pm)
      getDisconnectedPeer(pm)

      const address: PeerAddress = {
        address: connectedPeer.address,
        port: connectedPeer.port,
        identity: connectedPeer.state.identity,
        name: connectedPeer.name,
        lastAddedTimestamp: now,
      }

      addressManager.addPeer(connectedPeer)
      expect(addressManager.priorConnectedPeerAddresses).toContainEqual(address)
    })
  })
})
