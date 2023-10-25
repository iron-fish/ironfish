/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import { PeerAddress } from '../network/peers/peerAddress'
import { ParseJsonError } from '../utils/json'
import { KeyStore } from './keyStore'

export type PeerStoreOptions = {
  priorPeers: PeerAddress[]
}

export const PeerStoreOptionsDefaults: PeerStoreOptions = {
  priorPeers: [],
}

export const PEER_STORE_FILE_NAME = 'peers.json'

export class PeerStore extends KeyStore<PeerStoreOptions> {
  logger: Logger

  constructor(files: FileSystem, dataDir: string) {
    super(files, PEER_STORE_FILE_NAME, PeerStoreOptionsDefaults, dataDir)
    this.logger = createRootLogger()
  }

  async load(): Promise<void> {
    try {
      await super.load()
    } catch (e) {
      if (e instanceof ParseJsonError) {
        this.logger.debug(
          `Error: Could not parse JSON at ${this.storage.configPath}, overwriting file.`,
        )
        await super.save()
      } else {
        throw e
      }
    }
  }
}
