/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import { getTransactionSize } from './network/utils/serializers'
import { Transaction } from './primitives'
import { FollowChainStreamResponse } from './rpc/routes/chain/followChainStream'
import { BlockHashSerdeInstance } from './serde'
import { Metric } from './telemetry'
import { BufferUtils } from './utils'
import { HasOwnProperty, UnwrapPromise } from './utils/types'

type FaucetTransaction = {
  object: 'faucet_transaction'
  id: number
  public_key: string
  started_at: string | null
  completed_at: string | null
}

export const MultiAsssetTransactionTypes = [
  'MULTI_ASSET_TRANSFER',
  'MULTI_ASSET_BURN',
  'MULTI_ASSET_MINT',
]
export type MultiAssetTypes = typeof MultiAsssetTransactionTypes[number]

export type ApiMultiAssetUpload = {
  type: 'connected' | 'disconnected' | 'fork'
  block: {
    hash: string
    previousBlockHash: string
    timestamp: number
    sequence: number
  }
  transactions: {
    hash: string
    multiAssets: {
      type: MultiAssetTypes
      assetName: string
    }[]
  }[]
}

type ApiUser = {
  id: number
  country_code: string
  graffiti: string
  verified: boolean
  node_uptime_count: number
  node_uptime_threshold: number
  total_points: number
  rank: number
}

/**
 *  The API should be compatible with the Ironfish API here
 *  used to host our Facuet, BlockExplorer, and other things.
 *  https://github.com/iron-fish/ironfish-api
 */
export class WebApi {
  host: string
  token: string
  getFundsEndpoint: string | null

  constructor(options?: { host?: string; token?: string; getFundsEndpoint?: string }) {
    let host = options?.host ?? 'https://api.ironfish.network'

    if (host.endsWith('/')) {
      host = host.slice(0, -1)
    }

    this.host = host
    this.token = options?.token || ''
    this.getFundsEndpoint = options?.getFundsEndpoint || null
  }

  async getMultiAssetAddress(): Promise<string> {
    const response = await axios.get<{ address: string }>(`${this.host}/deposits/address`)
    return response.data.address
  }

  async headMultiAsset(): Promise<string | null> {
    const response = await axios
      .get<{ block_hash: string }>(`${this.host}/multi_asset/head`)
      .catch((e) => {
        // The API returns 404 for no head
        if (IsAxiosError(e) && e.response?.status === 404) {
          return null
        }

        throw e
      })

    return response?.data.block_hash || null
  }

  async headBlocks(): Promise<string | null> {
    const response = await axios
      .get<{ hash: string }>(`${this.host}/blocks/head`)
      .catch((e) => {
        // The API returns 404 for no head
        if (IsAxiosError(e) && e.response?.status === 404) {
          return null
        }

        throw e
      })

    return response?.data.hash || null
  }

  async uploadMultiAsset(multiAssets: ApiMultiAssetUpload[]): Promise<void> {
    this.requireToken()

    const options = this.options({ 'Content-Type': 'application/json' })
    await axios.post(`${this.host}/multi_asset`, { operations: multiAssets }, options)
  }

  async blocks(blocks: FollowChainStreamResponse[]): Promise<void> {
    this.requireToken()

    const serialized = blocks.map(({ type, block }) => ({
      type: type,
      hash: block.hash,
      sequence: block.sequence,
      timestamp: block.timestamp,
      previous_block_hash: block.previous,
      difficulty: block.difficulty,
      size: block.size,
      graffiti: block.graffiti,
      main: block.main,
      transactions: block.transactions,
      work: block.work,
    }))

    const options = this.options({ 'Content-Type': 'application/json' })

    await axios.post(`${this.host}/blocks`, { blocks: serialized }, options)
  }

  async transactions(transactions: Transaction[]): Promise<void> {
    this.requireToken()

    const serialized = []

    for (const transaction of transactions) {
      serialized.push({
        hash: BlockHashSerdeInstance.serialize(transaction.hash()),
        size: getTransactionSize(transaction),
        fee: Number(transaction.fee()),
        notes: transaction.notes.map((note) => ({
          commitment: note.hash().toString('hex'),
        })),
        spends: transaction.spends.map((spend) => ({
          nullifier: spend.nullifier.toString('hex'),
        })),
        mints: transaction.mints.map((mint) => ({
          id: mint.asset.id().toString('hex'),
          metadata: BufferUtils.toHuman(mint.asset.metadata()),
          name: BufferUtils.toHuman(mint.asset.name()),
          owner: mint.asset.owner().toString('hex'),
          value: mint.value.toString(),
        })),
        burns: transaction.burns.map((burn) => ({
          id: burn.assetId.toString('hex'),
          value: burn.value.toString(),
        })),
        expiration: transaction.expiration(),
      })
    }

    const options = this.options({ 'Content-Type': 'application/json' })

    await axios.post(`${this.host}/transactions`, { transactions: serialized }, options)
  }

  async getFunds(data: { email?: string; public_key: string }): Promise<{
    id: number
    object: 'faucet_transaction'
    public_key: string
    completed_at: number | null
    started_at: number | null
  }> {
    const endpoint = this.getFundsEndpoint || `${this.host}/faucet_transactions`
    const options = this.options({ 'Content-Type': 'application/json' })

    type GetFundsResponse = UnwrapPromise<ReturnType<WebApi['getFunds']>>

    const response = await axios.post<GetFundsResponse>(
      endpoint,
      {
        email: data.email,
        public_key: data.public_key,
      },
      options,
    )

    return response.data
  }

  async getNextFaucetTransactions(count: number): Promise<FaucetTransaction[]> {
    this.requireToken()

    const response = await axios.get<{ data: FaucetTransaction[] }>(
      `${this.host}/faucet_transactions/next?count=${count}`,
      this.options(),
    )

    return response.data.data
  }

  async getUser(id: number): Promise<ApiUser | null> {
    return await axios
      .get<ApiUser>(`${this.host}/users/${id}`, this.options())
      .then((r) => r.data)
      .catch(() => null)
  }

  async findUser(params: { graffiti: string; with_rank?: boolean }): Promise<ApiUser | null> {
    const options = this.options()
    options.params = params
    return await axios
      .get<ApiUser>(`${this.host}/users/find`, options)
      .then((r) => r.data)
      .catch((error: AxiosError<{ code: string; message?: string }>) => {
        if (error.response) {
          const { status } = error.response
          if (status >= 500 && status <= 599) {
            throw new Error(
              `API request to fetch user '${params.graffiti}' failed with status code: ${status}`,
            )
          }
        }

        return null
      })
  }

  async startFaucetTransaction(id: number): Promise<FaucetTransaction> {
    this.requireToken()

    const response = await axios.post<FaucetTransaction>(
      `${this.host}/faucet_transactions/${id}/start`,
      undefined,
      this.options(),
    )

    return response.data
  }

  async completeFaucetTransaction(id: number, hash: string): Promise<FaucetTransaction> {
    this.requireToken()

    const response = await axios.post<FaucetTransaction>(
      `${this.host}/faucet_transactions/${id}/complete`,
      { hash },
      this.options(),
    )

    return response.data
  }

  async submitTelemetry(payload: { points: Metric[]; graffiti?: string }): Promise<void> {
    await axios.post(`${this.host}/telemetry`, payload)
  }

  options(headers: Record<string, string> = {}): AxiosRequestConfig {
    return {
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...headers,
      },
    }
  }

  requireToken(): void {
    if (!this.token) {
      throw new Error(`Token required for endpoint`)
    }
  }
}

export function IsAxiosError(e: unknown): e is AxiosError {
  return typeof e === 'object' && e != null && HasOwnProperty(e, 'isAxiosError')
}
