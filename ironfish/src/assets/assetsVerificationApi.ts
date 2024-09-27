/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios, {
  AxiosAdapter,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'
import url, { URL } from 'url'
import { FileSystem } from '../fileSystems'

export type VerifiedAssetMetadata = {
  symbol: string
  decimals?: number
  logoURI?: string
  website?: string
}

export type VerifiedAssetMetadataResponse = { identifier: string } & VerifiedAssetMetadata

type GetAssetDataResponse = {
  version?: number
  assets: VerifiedAssetMetadataResponse[]
}

type GetVerifiedAssetsRequestHeaders = {
  'if-modified-since'?: string
}

type GetVerifiedAssetsResponseHeaders = {
  'last-modified'?: string
}

export class VerifiedAssets {
  private readonly assets: Map<string, VerifiedAssetMetadataResponse> = new Map()
  private lastModified?: string

  export(): ExportedVerifiedAssets {
    return {
      assets: Array.from(this.assets.values()),
      lastModified: this.lastModified,
    }
  }

  static restore(options: ExportedVerifiedAssets): VerifiedAssets {
    const verifiedAssets = new VerifiedAssets()
    options.assets.forEach((assetData) =>
      verifiedAssets.assets.set(assetData.identifier, sanitizedAssetData(assetData)),
    )
    verifiedAssets.lastModified = options.lastModified
    return verifiedAssets
  }

  getAssetData(assetId: Buffer | string): VerifiedAssetMetadata | undefined {
    if (!(typeof assetId === 'string')) {
      assetId = assetId.toString('hex')
    }
    return this.assets.get(assetId)
  }
}

// `ExportedVerifiedAssets` may seem redundant, given that it duplicates the
// same information in `VerifiedAssets`. However, it's needed to enable
// (de)serialization during caching. In particular, it solves the following
// issues:
// - `VerifiedAssets` is a class with methods, and the type-check logic as well
//   as the serialization logic expect methods to be serialized.
// - The `assets` field from `VerifiedAssets` is a `Map`, which is not
//   properly supported by the cache serializer.
export type ExportedVerifiedAssets = {
  assets: VerifiedAssetMetadataResponse[]
  lastModified?: string
}

export class AssetsVerificationApi {
  private readonly timeout: number
  private readonly adapter?: AxiosAdapter

  readonly url: string

  constructor(options: { files: FileSystem; url: string; timeout?: number }) {
    this.url = options.url
    this.timeout = options?.timeout ?? 30 * 1000 // 30 seconds
    this.adapter = isFileUrl(this.url)
      ? axiosFileAdapter(options.files)
      : axios.getAdapter(axios.defaults.adapter)
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
      .get<GetAssetDataResponse>(this.url, {
        headers: headers,
        timeout: this.timeout,
        adapter: this.adapter,
      })
      .then((response) => {
        verifiedAssets['assets'].clear()
        response.data.assets.forEach((assetData) => {
          return verifiedAssets['assets'].set(
            assetData.identifier,
            sanitizedAssetData(assetData),
          )
        })
        verifiedAssets['lastModified'] = (response.headers as GetVerifiedAssetsResponseHeaders)[
          'last-modified'
        ]
        return true
      })
      .catch((error: AxiosError) => {
        if (error.response?.status === 304) {
          return false
        }
        throw error
      })
  }
}

export function getDefaultAssetVerificationEndpoint(networkId?: number): string {
  if (networkId === 0) {
    return 'https://testnet.api.ironfish.network/assets/verified_metadata'
  }

  return 'https://api.ironfish.network/assets/verified_metadata'
}

const isFileUrl = (url: string): boolean => {
  const parsedUrl = new URL(url)
  return parsedUrl.protocol === 'file:'
}

const axiosFileAdapter =
  (files: FileSystem): AxiosAdapter =>
  (config: InternalAxiosRequestConfig): Promise<AxiosResponse<GetAssetDataResponse>> => {
    if (!config.url) {
      return Promise.reject(new Error('url is undefined'))
    }

    const path = url.fileURLToPath(config.url)

    return files
      .readFile(path)
      .then(JSON.parse)
      .then(
        (data): AxiosResponse<GetAssetDataResponse> => ({
          data: data as GetAssetDataResponse,
          status: 0,
          statusText: '',
          headers: {},
          config: config,
        }),
      )
  }

const sanitizedAssetData = (
  assetData: VerifiedAssetMetadataResponse,
): VerifiedAssetMetadataResponse => {
  return {
    identifier: assetData.identifier,
    symbol: assetData.symbol,
    decimals: assetData.decimals,
    logoURI: assetData.logoURI,
    website: assetData.website,
  }
}
