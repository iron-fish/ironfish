/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import {
  getConnectedPeer,
  getConnectingPeer,
  getDisconnectedPeer,
  getSignalingWebRtcPeer,
  mockHostsStore,
  mockIdentity,
  mockLocalPeer,
  webRtcCanInitiateIdentity,
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
    const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
    const addressManager = new AddressManager(mockHostsStore(), pm)
    addressManager.hostsStore = mockHostsStore()
    const { peer: peer1 } = getConnectedPeer(pm)
    const allPeers: Peer[] = [peer1]
    const allPeerAddresses: PeerAddress[] = []

    for (const peer of allPeers) {
      allPeerAddresses.push({
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity,
        name: peer.name,
      })
    }
    addressManager.hostsStore.set('priorPeers', allPeerAddresses)
    addressManager.removePeerAddress(peer1)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(0)
  })

  it('getRandomDisconnectedPeer should return a randomly-sampled disconnected peer', () => {
    const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
    const addressManager = new AddressManager(mockHostsStore(), pm)
    addressManager.hostsStore = mockHostsStore()
    const { peer: connectedPeer } = getConnectedPeer(pm)
    const { peer: connectingPeer } = getConnectingPeer(pm)
    const disconnectedPeer = getDisconnectedPeer(pm)
    const nonDisconnectedPeers: Peer[] = [connectedPeer, connectingPeer]
    const allPeerAddresses: PeerAddress[] = []

    for (const peer of [...nonDisconnectedPeers, disconnectedPeer]) {
      allPeerAddresses.push({
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity,
        name: peer.name,
      })
    }

    const nonDisconnectedIdentities = nonDisconnectedPeers.flatMap((peer) => {
      if (peer.state.type !== 'DISCONNECTED' && peer.state.identity !== null) {
        return peer.state.identity
      } else {
        return []
      }
    })

    addressManager.hostsStore.set('priorPeers', allPeerAddresses)

    const sample = addressManager.getRandomDisconnectedPeerAddress(nonDisconnectedIdentities)
    expect(sample).not.toBeNull()
    if (sample !== null) {
      expect(allPeerAddresses).toContainEqual(sample)
      expect(sample.address).toEqual(disconnectedPeer.address)
      expect(sample.port).toEqual(disconnectedPeer.port)
    }
  })

  describe('save', () => {
    it('save should persist connected peers via websocket', async () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      const addressManager = new AddressManager(mockHostsStore(), pm)
      addressManager.hostsStore = mockHostsStore()
      const { peer: connectedPeer } = getConnectedPeer(pm)
      const brokerIdentity = mockIdentity('brokering')
      const peerIdentity = webRtcCanInitiateIdentity()
      const { peer: signalingPeer } = getSignalingWebRtcPeer(pm, brokerIdentity, peerIdentity)

      getConnectingPeer(pm)
      getDisconnectedPeer(pm)
      const address: PeerAddress = {
        address: connectedPeer.address,
        port: connectedPeer.port,
        identity: connectedPeer.state.identity,
        name: connectedPeer.name,
      }
      const address2: PeerAddress = {
        address: signalingPeer.address,
        port: signalingPeer.port,
        identity: signalingPeer.state.identity,
        name: signalingPeer.name,
      }

      await addressManager.save()
      expect(addressManager.priorConnectedPeerAddresses).toContainEqual(address)
      expect(addressManager.priorConnectedPeerAddresses).not.toContainEqual(address2)
    })
  })
})
