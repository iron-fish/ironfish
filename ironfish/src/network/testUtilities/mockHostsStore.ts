/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_DATA_DIR, HostsOptions, HostsStore } from '../../fileStores'
import { FileSystem } from '../../fileSystems'
import { PeerAddress } from '../peers/peerAddress'

/**
 * Utility to create a fake HostsStore for use in
 * AddressManager and PeerManager
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async access(): Promise<void> {
    throw new Error('File does not exist')
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async writeFile(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async readFile(): Promise<string> {
    return '{}'
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async mkdir(): Promise<void> {}

  join(): string {
    return ''
  }

  dirname(): string {
    return ''
  }

  basename(): string {
    return ''
  }

  extname(): string {
    return ''
  }

  resolve(): string {
    return ''
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async exists(): Promise<boolean> {
    return false
  }
}

class MockHostsStore extends HostsStore {
  constructor() {
    super(new MockFileSystem(), DEFAULT_DATA_DIR)
    super.set('priorPeers', [
      {
        address: '127.0.0.1',
        port: 9999,
        identity: null,
        name: null,
      },
    ])
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async load(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async save(): Promise<void> {}

  getArray(key: keyof HostsOptions): PeerAddress[] {
    return super.getArray(key)
  }

  set(key: keyof HostsOptions, val: PeerAddress[]): void {
    super.set(key, val)
  }
}

export function mockHostsStore(): MockHostsStore {
  return new MockHostsStore()
}

export function mockFileSystem(): MockFileSystem {
  return new MockFileSystem()
}
