/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { InternalMessageType, PeerList } from '..'
import {
  getConnectedPeer,
  getConnectingPeer,
  getDisconnectedPeer,
  mockHostsStore,
  mockLocalPeer,
} from '../testUtilities'
import { ConnectionDirection, ConnectionType } from './connections'
import { Peer } from './peer'
import { PeerAddress } from './peerAddress'
import { PeerAddressManager } from './peerAddressManager'
import { PeerManager } from './peerManager'

jest.useFakeTimers()

describe('PeerAddressManager', () => {
  it('constructor load hosts from HostsStore', () => {
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    expect(peerAddressManager.addresses).toMatchObject([
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ])
  })

  it('addAddressesFromPeerList should add new addresses from a peer list', () => {
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    expect(peerAddressManager.addresses.length).toEqual(1)
    expect(peerAddressManager.addresses).toMatchObject([
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ])
    const peerList: PeerList = {
      type: InternalMessageType.peerList,
      payload: {
        connectedPeers: [
          {
            address: '1.1.1.1',
            identity: 'blah',
            name: 'blah',
            port: 1111,
          },
        ],
      },
    }
    peerAddressManager.addAddressesFromPeerList(peerList)
    expect(peerAddressManager.addresses.length).toEqual(2)
    expect(peerAddressManager.addresses).toContainEqual({
      address: '1.1.1.1',
      identity: 'blah',
      name: 'blah',
      port: 1111,
    })
  })

  it('getRandomDisconnectedPeer should return a randomly-sampled disconnected peer', () => {
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
    peerAddressManager.hostsStore.set('knownPeers', allPeerAddresses)
    const sample = peerAddressManager.getRandomDisconnectedPeer(allPeers)
    expect(allPeerAddresses).toContainEqual(sample)
    expect(sample.address).toEqual(disconnectedPeer.address)
    expect(sample.port).toEqual(disconnectedPeer.port)
  })

  describe('save', () => {
    it('save should persist connected peers', async () => {
      const peerAddressManager = new PeerAddressManager(mockHostsStore())
      const pm = new PeerManager(mockLocalPeer(), peerAddressManager)
      const { peer: connectedPeer } = getConnectedPeer(pm)
      const { peer: connectingPeer } = getConnectingPeer(pm)
      const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
      const address: PeerAddress = {
        address: connectedPeer.address,
        port: connectedPeer.port,
        identity: connectedPeer.state.identity,
        name: connectedPeer.name,
      }

      await peerAddressManager.save([connectedPeer, connectingPeer, disconnectedPeer])
      expect(peerAddressManager.addresses).toContainEqual(address)
    })

    it('should not persist peers that will never retry connecting', async () => {
      const peerAddressManager = new PeerAddressManager(mockHostsStore())
      const pm = new PeerManager(mockLocalPeer(), peerAddressManager)
      const { peer: connectedPeer } = getConnectedPeer(pm)
      const { peer: connectingPeer } = getConnectingPeer(pm)
      const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
      connectedPeer
        .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.neverRetryConnecting()

      await peerAddressManager.save([connectedPeer, connectingPeer, disconnectedPeer])
      expect(peerAddressManager.addresses.length).toEqual(0)
    })
  })
})
