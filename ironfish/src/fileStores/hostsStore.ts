/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../fileSystems'
import { PeerAddr } from '../network/peers/peerAddr'
import { KeyStore } from './keyStore'

export type HostsOptions = {
  hosts: PeerAddr[]
}

export const HostOptionsDefaults: HostsOptions = {
  hosts: [
    {
      address: null,
      port: null,
    },
  ],
}

export class HostsStore extends KeyStore<HostsOptions> {
  constructor(files: FileSystem, dataDir?: string, configName?: string) {
    super(files, configName || 'hosts.json', HostOptionsDefaults, dataDir)
  }
}
