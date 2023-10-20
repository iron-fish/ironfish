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
  it('removePeerAddress should remove a peer address', () => {
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

  it('addPeer should update peer timestamp if it is already in the address manager', () => {
    const now = Date.now()
    Date.now = jest.fn(() => now)
    const hostsStore = mockHostsStore()
    const pm = new PeerManager(mockLocalPeer(), hostsStore)
    const addressManager = new AddressManager(hostsStore, pm)
    addressManager.hostsStore = hostsStore
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

    const newNow = Date.now()
    Date.now = jest.fn(() => newNow)
    addressManager.addPeer(peer)
    expect(addressManager.priorConnectedPeerAddresses.length).toEqual(1)
    expect(addressManager.priorConnectedPeerAddresses).toContainEqual({
      ...peerAddress,
      lastAddedTimestamp: newNow,
    })
  })

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
