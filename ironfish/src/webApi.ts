/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import axios, { AxiosRequestConfig } from 'axios'
import { FollowChainStreamResponse } from './rpc/routes/chain/followChain'
import { Metric } from './telemetry'
import { UnwrapPromise } from './utils/types'

type FaucetTransaction = {
  object: 'faucet_transaction'
  id: number
  public_key: string
  started_at: string | null
  completed_at: string | null
}

type ApiUser = {
  id: number
  country_code: string
  graffiti: string
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

  async head(): Promise<string | null> {
    const response = await axios
      .get<{ hash: string }>(`${this.host}/blocks/head`)
      .catch(() => null)

    return response?.data.hash || null
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
    }))

    const options = this.options({ 'Content-Type': 'application/json' })

    await axios.post(`${this.host}/blocks`, { blocks: serialized }, options)
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

  async submitTelemetry(payload: { points: Metric[] }): Promise<void> {
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
