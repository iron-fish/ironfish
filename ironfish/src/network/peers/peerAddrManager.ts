/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Identity } from '..'
import { ArrayUtils } from '../..'
import { PeerAddr } from './peerAddr'
import { HostsStore } from '../../fileStores/hostsStore'

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

  createPeerAddr(address: string | null, port: number | null, identity?: Identity | undefined) {
    this.addrs.push({
      address: address,
      port: port,
      identity: identity,
    })
  }

  save() {
    const inUseAddrs = this.addrs.filter((addr) => addr.inUse === true)
    this.hostsStore.set('hosts', inUseAddrs)
    this.hostsStore.save()
  }
}
