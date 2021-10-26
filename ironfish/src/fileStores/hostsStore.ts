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
