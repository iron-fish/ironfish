/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios, { AxiosAdapter, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import url, { URL } from 'url'
import { FileSystem } from '../fileSystems'

type GetVerifiedAssetsResponse = {
  assets: Array<{ identifier: string }>
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

  export(): ExportedVerifiedAssets {
    return {
      assetIds: Array.from(this.assetIds),
      lastModified: this.lastModified,
    }
  }

  static restore(options: ExportedVerifiedAssets): VerifiedAssets {
    const verifiedAssets = new VerifiedAssets()
    options.assetIds.forEach((identifier) => verifiedAssets.assetIds.add(identifier))
    verifiedAssets.lastModified = options.lastModified
    return verifiedAssets
  }

  isVerified(assetId: Buffer | string): boolean {
    if (!(typeof assetId === 'string')) {
      assetId = assetId.toString('hex')
    }
    return this.assetIds.has(assetId)
  }
}

// `ExportedVerifiedAssets` may seem redundant, given that it duplicates the
// same information in `VerifiedAssets`. However, it's needed to enable
// (de)serialization during caching. In particular, it solves the following
// issues:
// - `VerifiedAssets` is a class with methods, and the type-check logic as well
//   as the serialization logic expect methods to be serialized.
// - The `assetIds` field from `VerifiedAssets` is a `Set`, which is not
//   properly supported by the cache serializer.
export type ExportedVerifiedAssets = {
  assetIds: string[]
  lastModified?: string
}

export class AssetsVerificationApi {
  private readonly timeout: number
  private readonly adapter?: AxiosAdapter

  readonly url: string

  constructor(options: { files: FileSystem; url?: string; timeout?: number }) {
    this.url = options?.url || 'https://api.ironfish.network/assets/verified'
    this.timeout = options?.timeout ?? 30 * 1000 // 30 seconds
    this.adapter = isFileUrl(this.url)
      ? axiosFileAdapter(options.files)
      : axios.defaults.adapter
  }

  async getVerifiedAssets(): Promise<VerifiedAssets> {
    const verifiedAssets = new VerifiedAssets()
    await this.refreshVerifiedAssets(verifiedAssets)
    return verifiedAssets
  }

  /**
   * Queries the remote API for an updated version of `verifiedAssets`.
   * @returns `true` if `verifiedAssets` has been updated; `false` otherwise,
   */
  refreshVerifiedAssets(verifiedAssets: VerifiedAssets): Promise<boolean> {
    const headers: GetVerifiedAssetsRequestHeaders = {}
    if (verifiedAssets['lastModified']) {
      headers['if-modified-since'] = verifiedAssets['lastModified']
    }
    return axios
      .get<GetVerifiedAssetsResponse>(this.url, {
        headers: headers,
        timeout: this.timeout,
        adapter: this.adapter,
      })
      .then(
        (response: {
          data: GetVerifiedAssetsResponse
          headers: GetVerifiedAssetsResponseHeaders
        }) => {
          verifiedAssets['assetIds'].clear()
          response.data.assets.forEach(({ identifier }) => {
            return verifiedAssets['assetIds'].add(identifier)
          })
          verifiedAssets['lastModified'] = response.headers['last-modified']
          return true
        },
      )
      .catch((error: AxiosError) => {
        if (error.response?.status === 304) {
          return false
        }
        throw error
      })
  }
}

const isFileUrl = (url: string): boolean => {
  const parsedUrl = new URL(url)
  return parsedUrl.protocol === 'file:'
}

const axiosFileAdapter =
  (files: FileSystem) =>
  (config: AxiosRequestConfig): Promise<AxiosResponse<GetVerifiedAssetsResponse>> => {
    if (!config.url) {
      return Promise.reject(new Error('url is undefined'))
    }

    const path = url.fileURLToPath(config.url)

    return files
      .readFile(path)
      .then(JSON.parse)
      .then((data: GetVerifiedAssetsResponse) => ({
        data,
        status: 0,
        statusText: '',
        headers: {},
        config: config,
      }))
  }
