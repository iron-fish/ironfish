/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { InternalMessageType, PeerList } from '../messages'
import {
  getConnectedPeer,
  getConnectingPeer,
  getDisconnectedPeer,
  mockFileSystem,
  mockHostsStore,
  mockLocalPeer,
} from '../testUtilities'
import { AddressManager } from './addressManager'
import { ConnectionDirection, ConnectionType } from './connections'
import { Peer } from './peer'
import { PeerAddress } from './peerAddress'
import { PeerManager } from './peerManager'

jest.useFakeTimers()

describe('AddressManager', () => {
  it('constructor loads addresses from HostsStore', () => {
    const addressManager = new AddressManager(mockFileSystem())
    addressManager.hostsStore = mockHostsStore()
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
        identity: null,
        name: null,
      },
    ])
  })

  it('addAddressesFromPeerList should add new addresses from a peer list', () => {
    const addressManager = new AddressManager(mockFileSystem())
    addressManager.hostsStore = mockHostsStore()
    expect(addressManager.possiblePeerAddresses.length).toEqual(1)
    expect(addressManager.possiblePeerAddresses).toMatchObject([
      {
        address: '1.1.1.1',
        port: 1111,
        identity: null,
        name: null,
      },
    ])
    const peerList: PeerList = {
      type: InternalMessageType.peerList,
      payload: {
        connectedPeers: [
          {
            address: '2.2.2.2',
            identity: 'blah',
            name: 'blah',
            port: 2222,
          },
        ],
      },
    }
    addressManager.addAddressesFromPeerList(peerList)
    expect(addressManager.possiblePeerAddresses.length).toEqual(2)
    expect(addressManager.possiblePeerAddresses).toContainEqual({
      address: '2.2.2.2',
      identity: 'blah',
      name: 'blah',
      port: 2222,
    })
  })

  it('removePeerAddress should remove a peer address', () => {
    const addressManager = new AddressManager(mockFileSystem())
    addressManager.hostsStore = mockHostsStore()
    const pm = new PeerManager(mockLocalPeer(), mockFileSystem())
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
    addressManager.hostsStore.set('possiblePeers', allPeerAddresses)
    addressManager.hostsStore.set('priorPeers', allPeerAddresses)
    addressManager.removePeerAddress(peer1)
    expect(addressManager.possiblePeerAddresses.length).toEqual(0)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(0)
  })

  it('getRandomDisconnectedPeer should return a randomly-sampled disconnected peer', () => {
    const addressManager = new AddressManager(mockFileSystem())
    addressManager.hostsStore = mockHostsStore()
    const pm = new PeerManager(mockLocalPeer(), mockFileSystem())
    const { peer: connectedPeer } = getConnectedPeer(pm)
    const { peer: connectingPeer } = getConnectingPeer(pm)
    const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
    const nonDisconnectedPeers: Peer[] = [connectedPeer, connectingPeer]
    const allPeerAddresses: PeerAddress[] = []

    for (const peer of [...nonDisconnectedPeers, disconnectedPeer]) {
      allPeerAddresses.push({
        address: peer.address,
        port: peer.port,
        identity: 'boop',
        name: peer.name,
      })
    }

    addressManager.hostsStore.set('priorPeers', allPeerAddresses)
    addressManager.hostsStore.set('possiblePeers', allPeerAddresses)
    const sample = addressManager.getRandomDisconnectedPeerAddress(nonDisconnectedPeers)
    expect(sample).not.toBeNull()
    if (sample !== null) {
      expect(allPeerAddresses).toContainEqual(sample)
      expect(sample.address).toEqual(disconnectedPeer.address)
      expect(sample.port).toEqual(disconnectedPeer.port)
    }
  })

  describe('save', () => {
    it('save should persist connected peers', async () => {
      const addressManager = new AddressManager(mockFileSystem())
      addressManager.hostsStore = mockHostsStore()
      const pm = new PeerManager(mockLocalPeer(), mockFileSystem())
      const { peer: connectedPeer } = getConnectedPeer(pm)
      const { peer: connectingPeer } = getConnectingPeer(pm)
      const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
      const address: PeerAddress = {
        address: connectedPeer.address,
        port: connectedPeer.port,
        identity: connectedPeer.state.identity,
        name: connectedPeer.name,
      }

      await addressManager.save([connectedPeer, connectingPeer, disconnectedPeer])
      expect(addressManager.priorConnectedPeerAddresses).toContainEqual(address)
    })

    it('should not persist peers that will never retry connecting', async () => {
      const addressManager = new AddressManager(mockFileSystem())
      addressManager.hostsStore = mockHostsStore()
      expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
      const pm = new PeerManager(mockLocalPeer(), mockFileSystem())
      const { peer: connectedPeer } = getConnectedPeer(pm)
      const { peer: connectingPeer } = getConnectingPeer(pm)
      const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
      connectedPeer
        .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.neverRetryConnecting()

      await addressManager.save([connectedPeer, connectingPeer, disconnectedPeer])
      expect(addressManager.priorConnectedPeerAddresses.length).toEqual(0)
    })
  })
})
