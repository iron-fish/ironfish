/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../fileSystems'
import { DEFAULT_NETWORK_ID } from './config'
import { KeyStore } from './keyStore'

export type InternalOptions = {
  isFirstRun: boolean
  networkIdentity: string
  telemetryNodeId: string
  rpcAuthToken: string
  networkId: number
  timeToPostOneNote: number
}

export const InternalOptionsDefaults: InternalOptions = {
  isFirstRun: true,
  networkIdentity: '',
  telemetryNodeId: '',
  rpcAuthToken: '',
  networkId: DEFAULT_NETWORK_ID,
  timeToPostOneNote: 1,
}

export class InternalStore extends KeyStore<InternalOptions> {
  constructor(files: FileSystem, dataDir: string, configName?: string) {
    super(files, configName || 'internal.json', InternalOptionsDefaults, dataDir)
  }
}
