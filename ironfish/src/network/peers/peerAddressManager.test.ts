/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
jest.mock('ws')

import { InternalMessageType, PeerList } from '../messages'
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
  it('addAddressesFromPeerList should add new addresses from a peer list', () => {
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    expect(peerAddressManager.possiblePeerAddresses.length).toEqual(1)
    expect(peerAddressManager.possiblePeerAddresses).toMatchObject([
      {
        address: '1.1.1.1',
        port: 1111,
        identity: undefined,
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
    peerAddressManager.addAddressesFromPeerList(peerList)
    expect(peerAddressManager.possiblePeerAddresses.length).toEqual(2)
    expect(peerAddressManager.possiblePeerAddresses).toContainEqual({
      address: '2.2.2.2',
      identity: 'blah',
      name: 'blah',
      port: 2222,
    })
  })

  it('getRandomDisconnectedPeer should return a randomly-sampled disconnected peer', () => {
    const peerAddressManager = new PeerAddressManager(mockHostsStore())
    const pm = new PeerManager(mockLocalPeer(), peerAddressManager)
    const { peer: connectedPeer } = getConnectedPeer(pm)
    const { peer: connectingPeer } = getConnectingPeer(pm)
    const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
    const allPeers: Peer[] = [connectedPeer, connectingPeer, disconnectedPeer]
    const allPeerAddresses: PeerAddress[] = []

    for (const peer of allPeers) {
      allPeerAddresses.push({
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity,
      })
    }
    peerAddressManager.hostsStore.set('possiblePeers', allPeerAddresses)
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
      expect(peerAddressManager.priorConnectedPeerAddresses).toContainEqual(address)
    })

    it('should not persist peers that will never retry connecting', async () => {
      const peerAddressManager = new PeerAddressManager(mockHostsStore())
      expect(peerAddressManager.priorConnectedPeerAddresses.length).toEqual(1)
      const pm = new PeerManager(mockLocalPeer(), peerAddressManager)
      const { peer: connectedPeer } = getConnectedPeer(pm)
      const { peer: connectingPeer } = getConnectingPeer(pm)
      const { peer: disconnectedPeer } = getDisconnectedPeer(pm)
      connectedPeer
        .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.neverRetryConnecting()

      await peerAddressManager.save([connectedPeer, connectingPeer, disconnectedPeer])
      expect(peerAddressManager.priorConnectedPeerAddresses.length).toEqual(1)
    })
  })
})
