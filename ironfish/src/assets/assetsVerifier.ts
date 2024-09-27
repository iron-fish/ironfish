/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VerifiedAssetsCacheStore } from '../fileStores/verifiedAssets'
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import { ErrorUtils } from '../utils'
import { SetIntervalToken } from '../utils'
import { Retry } from '../utils'
import {
  AssetsVerificationApi,
  VerifiedAssetMetadata,
  VerifiedAssets,
} from './assetsVerificationApi'

export type AssetVerification =
  | { status: 'unverified' | 'unknown' }
  | ({ status: 'verified' } & VerifiedAssetMetadata)

export class AssetsVerifier {
  private readonly REFRESH_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours

  private readonly logger: Logger
  private readonly api: AssetsVerificationApi
  private readonly cache?: VerifiedAssetsCacheStore
  private readonly retry = new Retry({
    delay: 60 * 1000, // 1 minute
    jitter: 0.2, // 20%
    maxDelay: 60 * 60 * 1000, // 1 hour
  })

  private started: boolean
  private refreshToken?: SetIntervalToken
  private verifiedAssets?: VerifiedAssets

  constructor(options: {
    files: FileSystem
    apiUrl: string
    cache?: VerifiedAssetsCacheStore
    logger?: Logger
  }) {
    this.logger = options.logger ?? createRootLogger()
    this.api = new AssetsVerificationApi({ url: options.apiUrl, files: options.files })
    this.cache = options.cache
    this.started = false

    if (this.cache?.config?.apiUrl === this.api.url) {
      this.verifiedAssets = VerifiedAssets.restore(this.cache.config)
    }
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    void this.refreshLoop()
  }

  stop(): void {
    if (!this.started) {
      return
    }

    this.started = false

    if (this.refreshToken) {
      clearTimeout(this.refreshToken)
    }
  }

  private async refreshLoop(): Promise<void> {
    await this.retry.try(this.refresh.bind(this))

    this.refreshToken = setTimeout(() => {
      void this.refreshLoop()
    }, this.REFRESH_INTERVAL)
  }

  private async refresh(): Promise<void> {
    try {
      if (this.verifiedAssets) {
        this.logger.debug(`Refreshing list of verified assets from ${this.api.url}`)
        if (await this.api.refreshVerifiedAssets(this.verifiedAssets)) {
          await this.saveCache()
        }
      } else {
        this.logger.debug(`Downloading list of verified assets from ${this.api.url}`)
        this.verifiedAssets = await this.api.getVerifiedAssets()
        await this.saveCache()
      }
    } catch (error) {
      this.logger.warn(`Error while fetching verified assets: ${ErrorUtils.renderError(error)}`)
      throw error
    }
  }

  private saveCache(): Promise<void> {
    if (!this.cache) {
      return Promise.resolve()
    }
    this.cache.setMany({
      apiUrl: this.api.url,
      ...(this.verifiedAssets ?? new VerifiedAssets()).export(),
    })
    return this.cache.save()
  }

  getAssetData(assetId: Buffer | string): VerifiedAssetMetadata | undefined {
    return this.verifiedAssets?.getAssetData(assetId)
  }

  verify(assetId: Buffer | string): AssetVerification {
    if (!this.verifiedAssets) {
      return { status: 'unknown' }
    }

    const assetData = this.getAssetData(assetId)
    if (assetData) {
      return {
        status: 'verified',
        symbol: assetData.symbol,
        decimals: assetData.decimals,
        logoURI: assetData.logoURI,
        website: assetData.website,
      }
    } else {
      return { status: 'unverified' }
    }
  }
}
