/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import axios, { AxiosRequestConfig } from 'axios'
import { FollowChainStreamResponse } from './rpc/routes/chain/followChain'
import { UnwrapPromise } from './utils/types'

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
    let host = options?.host ?? 'https://api-production.ironfish.network'

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
