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
  it('removePeer should remove a peer address', () => {
    const hostsStore = mockHostsStore()
    const localPeer = mockLocalPeer()
    const pm = new PeerManager(localPeer, hostsStore)
    const addressManager = new AddressManager(hostsStore, pm)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(0)
    const { peer: peer1 } = getConnectedPeer(pm)
    addressManager.addPeer(peer1)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
    addressManager.removePeer(peer1)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(0)
  })

  it('only connected peers get added to the address manager', () => {
    const now = Date.now()
    Date.now = jest.fn(() => now)
    const hostsStore = mockHostsStore()
    const pm = new PeerManager(mockLocalPeer(), hostsStore)
    const addressManager = new AddressManager(hostsStore, pm)
    addressManager.hostsStore = hostsStore
    const { peer: connectedPeer } = getConnectedPeer(pm)
    const { peer: connectingPeer } = getConnectingPeer(pm)
    const disconnectedPeer = getDisconnectedPeer(pm)
    const allPeers: Peer[] = [connectedPeer, connectingPeer, disconnectedPeer]

    for (const peer of allPeers) {
      addressManager.addPeer(peer)
    }

    const connectedPeerAddress = {
      address: connectedPeer.address,
      port: connectedPeer.port,
      identity: connectedPeer.state.identity,
      name: connectedPeer.name,
      lastAddedTimestamp: now,
    }

    expect(addressManager.priorConnectedPeerAddresses).toContainEqual(connectedPeerAddress)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
  })

  it('If more than LIMIT, then only load LIMIT peers', () => {
    const hostsStore = mockHostsStore()
    const pm = new PeerManager(mockLocalPeer(), hostsStore)
    const { peer: connectedPeer } = getConnectedPeer(pm)
    const peerAddress = {
      address: connectedPeer.address || '',
      port: connectedPeer.port || 0,
      identity: connectedPeer.state.identity,
      name: connectedPeer.name,
      lastAddedTimestamp: Date.now(),
    }
    hostsStore.set(
      'priorPeers',
      Array.from({ length: 60 }, () => {
        const randomIdentity = Math.random().toString(36).substring(7)
        return {
          ...peerAddress,
          identity: randomIdentity,
        }
      }),
    )

    const addressManager = new AddressManager(hostsStore, pm)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(addressManager.LIMIT)
  })

  it('addPeer should remove the oldest peer if the address manager is full', () => {
    const oldestNow = Date.now()
    Date.now = jest.fn(() => oldestNow)
    const hostsStore = mockHostsStore()
    const pm = new PeerManager(mockLocalPeer(), hostsStore)
    const addressManager = new AddressManager(hostsStore, pm)

    const { peer: oldestPeer } = getConnectedPeer(pm)
    addressManager.addPeer(oldestPeer)
    const oldestPeerAddress = {
      address: oldestPeer.address,
      port: oldestPeer.port,
      identity: oldestPeer.state.identity,
      name: oldestPeer.name,
      lastAddedTimestamp: oldestNow,
    }

    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
    expect(addressManager.priorConnectedPeerAddresses).toContainEqual(oldestPeerAddress)

    const newNow = oldestNow + 1000
    Date.now = jest.fn(() => newNow)

    const { peer: newPeer } = getConnectedPeer(pm)
    addressManager.addPeer(newPeer)
    const newPeerAddress = {
      address: newPeer.address,
      port: newPeer.port,
      identity: newPeer.state.identity,
      name: newPeer.name,
      lastAddedTimestamp: newNow,
    }

    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(2)
    expect(addressManager.priorConnectedPeerAddresses).toContainEqual(newPeerAddress)

    // add 49 more peers
    for (let i = 0; i < 49; i++) {
      const randomIdentity = Math.random().toString(36).substring(7)
      addressManager.addPeer({
        ...newPeer,
        state: {
          ...newPeer.state,
          identity: randomIdentity,
        },
      } as Peer)
    }

    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(addressManager.LIMIT)
    expect(addressManager.priorConnectedPeerAddresses).toContainEqual(newPeerAddress)
    // the oldest peer should have been removed
    expect(addressManager.priorConnectedPeerAddresses).not.toContainEqual(oldestPeerAddress)
  })

  it('addPeer should update peer timestamp if it is already in the address manager', () => {
    const now = Date.now()
    const newNow = now + 1000
    Date.now = jest.fn(() => now)
    const hostsStore = mockHostsStore()
    const pm = new PeerManager(mockLocalPeer(), hostsStore)
    const addressManager = new AddressManager(hostsStore, pm)
    const { peer } = getConnectedPeer(pm)
    addressManager.addPeer(peer)
    const peerAddress = {
      address: peer.address,
      port: peer.port,
      identity: peer.state.identity,
      name: peer.name,
      lastAddedTimestamp: now,
    }
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
    expect(addressManager.priorConnectedPeerAddresses).toContainEqual(peerAddress)

    Date.now = jest.fn(() => newNow)
    addressManager.addPeer(peer)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
    expect(addressManager.priorConnectedPeerAddresses).toContainEqual({
      ...peerAddress,
      lastAddedTimestamp: newNow,
    })
  })

  it('save should persist connected peers', async () => {
    const now = Date.now()
    Date.now = jest.fn(() => now)
    const hostsStore = mockHostsStore()

    const pm = new PeerManager(mockLocalPeer(), hostsStore)
    const addressManager = new AddressManager(hostsStore, pm)
    addressManager.hostsStore = hostsStore
    const { peer: connectedPeer } = getConnectedPeer(pm)
    getConnectingPeer(pm)
    getDisconnectedPeer(pm)

    const address: PeerAddress = {
      address: connectedPeer.address || '',
      port: connectedPeer.port || 0,
      identity: connectedPeer.state.identity || '',
      name: connectedPeer.name,
      lastAddedTimestamp: now,
    }

    addressManager.addPeer(connectedPeer)
    await addressManager.save()
    expect(addressManager.priorConnectedPeerAddresses).toContainEqual(address)
  })
})
