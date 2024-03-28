/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import path from 'path'
import { ExportedVerifiedAssets } from '../assets'
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import { ParseJsonError } from '../utils/json'
import { KeyStore } from './keyStore'

export type VerifiedAssetsCacheOptions = {
  apiUrl: string
} & ExportedVerifiedAssets

export const VerifiedAssetsCacheOptionsDefaults: VerifiedAssetsCacheOptions = {
  apiUrl: '',
  assets: [],
}

export const VERIFIED_ASSETS_CACHE_FILE_NAME = path.join('temp', 'verified-assets.json')

export class VerifiedAssetsCacheStore extends KeyStore<VerifiedAssetsCacheOptions> {
  logger: Logger

  constructor(files: FileSystem, dataDir: string) {
    super(files, VERIFIED_ASSETS_CACHE_FILE_NAME, VerifiedAssetsCacheOptionsDefaults, dataDir)
    this.logger = createRootLogger()
  }

  async load(): Promise<void> {
    try {
      await super.load()
    } catch (e) {
      if (e instanceof ParseJsonError) {
        this.logger.debug(
          `Error: Could not parse JSON at ${this.storage.configPath}, ignoring.`,
        )
      } else {
        throw e
      }
    }
  }
}
