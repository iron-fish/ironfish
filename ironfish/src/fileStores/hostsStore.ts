/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../fileSystems'
import { PeerAddress } from '../network/peers/peerAddress'
import { KeyStore } from './keyStore'

export type HostsOptions = {
  priorConnectedPeers: PeerAddress[]
  possiblePeers: PeerAddress[]
}

export const HostOptionsDefaults: HostsOptions = {
  priorConnectedPeers: [],
  possiblePeers: [],
}

export class HostsStore extends KeyStore<HostsOptions> {
  constructor(files: FileSystem, dataDir?: string, configName?: string) {
    super(files, configName || 'hosts.json', HostOptionsDefaults, dataDir)
  }
}
