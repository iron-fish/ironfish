/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import { KeyStore } from './keyStore'

export type PeerAddress = {
  address: string
  port: number
  name: string | null
  lastAddedTimestamp: number
}

export type PeerStoreOptions = {
  priorPeers: PeerAddress[]
}

export const PeerStoreOptionsDefaults: PeerStoreOptions = {
  priorPeers: [],
}

// This filename ("hosts.json") is left over from when this file used to be called HostsStore
// We will likely change the name when we adding more functionality like storing
// whitelisted peers, banned peers, etc.
export const PEER_STORE_FILE_NAME = 'hosts.json'

export class PeerStore extends KeyStore<PeerStoreOptions> {
  logger: Logger

  constructor(files: FileSystem, dataDir: string) {
    super(files, PEER_STORE_FILE_NAME, PeerStoreOptionsDefaults, dataDir)
    this.logger = createRootLogger()
  }

  getPriorPeers(): PeerAddress[] {
    // Checking for null values in case the file is an older version
    return this.getArray('priorPeers').flatMap((peer) => {
      if (peer.address === null || peer.port === null) {
        return []
      }

      return {
        address: peer.address,
        port: peer.port,
        name: peer.name,
        lastAddedTimestamp: peer.lastAddedTimestamp ?? 0,
      }
    })
  }
}
