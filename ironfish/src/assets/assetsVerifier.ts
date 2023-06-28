/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '../logger'
import { ErrorUtils } from '../utils'
import { SetIntervalToken } from '../utils'
import { AssetsVerificationApi, VerifiedAssets } from './assetsVerificationApi'

export type AssetVerification = {
  status: 'verified' | 'unverified' | 'unknown'
}

export class AssetsVerifier {
  private readonly REFRESH_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours

  private readonly logger: Logger
  private readonly api: AssetsVerificationApi

  private started: boolean
  private refreshToken?: SetIntervalToken
  private verifiedAssets?: VerifiedAssets

  constructor(options?: { apiUrl?: string; logger?: Logger }) {
    this.logger = options?.logger ?? createRootLogger()
    this.api = new AssetsVerificationApi({ url: options?.apiUrl })
    this.started = false
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
    await this.refresh()

    this.refreshToken = setTimeout(() => {
      void this.refreshLoop()
    }, this.REFRESH_INTERVAL)
  }

  private async refresh(): Promise<void> {
    try {
      if (this.verifiedAssets) {
        this.logger.debug(`Refreshing list of verified assets from ${this.api.url}`)
        await this.api.refreshVerifiedAssets(this.verifiedAssets)
      } else {
        this.logger.debug(`Downloading list of verified assets from ${this.api.url}`)
        this.verifiedAssets = await this.api.getVerifiedAssets()
      }
    } catch (error) {
      this.logger.warn(`Error while fetching verified assets: ${ErrorUtils.renderError(error)}`)
    }
  }

  verify(assetId: Buffer | string): AssetVerification {
    if (!this.started || !this.verifiedAssets) {
      return { status: 'unknown' }
    } else if (this.verifiedAssets.isVerified(assetId)) {
      return { status: 'verified' }
    } else {
      return { status: 'unverified' }
    }
  }
}
