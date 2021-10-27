/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArrayUtils } from '../..'
import { HostsStore } from '../../fileStores/hostsStore'
import { Peer } from '..'
import { PeerAddr } from './peerAddr'

export class PeerAddrManager {
  addrs: Array<PeerAddr>
  hostsStore: HostsStore

  constructor(hostsStore: HostsStore) {
    this.hostsStore = hostsStore
    this.addrs = this.hostsStore.getArray('hosts')
  }

  getPeerAddr(): PeerAddr {
    return ArrayUtils.sampleOrThrow(this.addrs)
  }

  async save(peers: Peer[]): Promise<void> {
    const inUseAddrs = peers
      .filter((peer) => peer.state.type === 'CONNECTED')
      .map((peer) => ({
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity,
      }))
    this.hostsStore.set('hosts', inUseAddrs)
    await this.hostsStore.save()
  }
}
