/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores/hostsStore'
import { FileSystem } from '../../fileSystems'
import { PeerAddr } from '../peers/peerAddr'

/**
 * Utility to create a fake HostsStore for use in
 * PeerAddrManager and PeerManager
 */

class MockFileSystem extends FileSystem {
  fsSync: typeof import('fs') | null = null
  fs: typeof import('fs').promises | null = null
  path: typeof import('path') | null = null
  os: typeof import('os') | null = null

  async init(): Promise<FileSystem> {
    this.fsSync = await import('fs')
    this.path = await import('path')
    this.os = await import('os')
    this.fs = this.fsSync.promises
    return this
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async writeFile(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async readFile(): Promise<string> {
    return ''
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async mkdir(): Promise<void> {}

  join(): string {
    return ''
  }

  resolve(): string {
    return ''
  }
}

class MockHostsStore extends HostsStore {
  hosts: PeerAddr[]

  constructor() {
    super(new MockFileSystem())
    this.hosts = []
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async load(): Promise<void> {
    this.hosts = [
      {
        address: '127.0.0.1',
        port: 9999,
      },
    ]
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async save(): Promise<void> {}
}

export function mockHostsStore(): MockHostsStore {
  return new MockHostsStore()
}
