/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios, { AxiosError } from 'axios'

type GetVerifiedAssetsResponse = {
  data: Array<{ identifier: string }>
}

type GetVerifiedAssetsRequestHeaders = {
  'if-modified-since'?: string
}

type GetVerifiedAssetsResponseHeaders = {
  'last-modified'?: string
}

export class VerifiedAssets {
  private readonly assetIds: Set<string> = new Set()
  private lastModified?: string

  isVerified(assetId: Buffer | string): boolean {
    if (!(typeof assetId === 'string')) {
      assetId = assetId.toString('hex')
    }
    return this.assetIds.has(assetId)
  }
}

export class AssetsVerificationApi {
  private readonly timeout: number

  readonly url: string

  constructor(options?: { url?: string; timeout?: number }) {
    this.url = options?.url ?? 'https://api.ironfish.network/assets?verified=true'
    this.timeout = options?.timeout ?? 30 * 1000 // 30 seconds
  }

  async getVerifiedAssets(): Promise<VerifiedAssets> {
    const verifiedAssets = new VerifiedAssets()
    await this.refreshVerifiedAssets(verifiedAssets)
    return verifiedAssets
  }

  refreshVerifiedAssets(verifiedAssets: VerifiedAssets): Promise<void> {
    const headers: GetVerifiedAssetsRequestHeaders = {}
    if (verifiedAssets['lastModified']) {
      headers['if-modified-since'] = verifiedAssets['lastModified']
    }
    return axios
      .get<GetVerifiedAssetsResponse>(this.url, {
        headers: headers,
        timeout: this.timeout,
      })
      .then(
        (response: {
          data: GetVerifiedAssetsResponse
          headers: GetVerifiedAssetsResponseHeaders
        }) => {
          verifiedAssets['assetIds'].clear()
          response.data.data.forEach(({ identifier }) => {
            return verifiedAssets['assetIds'].add(identifier)
          })
          verifiedAssets['lastModified'] = response.headers['last-modified']
        },
      )
      .catch((error: AxiosError) => {
        if (error.response?.status === 304) {
          return
        }
        throw error
      })
  }
}
