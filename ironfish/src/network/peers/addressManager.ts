/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores'
import { FileSystem } from '../../fileSystems'
import { PeerAddress } from './peerAddress'

/**
 * AddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class AddressManager {
  hostsStore: HostsStore

  constructor(files: FileSystem, dataDir?: string) {
    this.hostsStore = new HostsStore(files, dataDir)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.hostsStore.load()
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('priorPeers')
  }

  get possiblePeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('possiblePeers')
  }
}
