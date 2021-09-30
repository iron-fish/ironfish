/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import axios, { AxiosRequestConfig } from 'axios'
import { FollowChainStreamResponse } from 'ironfish'

/**
 *  The API should be compatible with the Ironfish API here:
 *  https://github.com/iron-fish/ironfish-api/blob/master/src/blocks/blocks.controller.ts
 */
export class IronfishApi {
  host: string
  token: string

  constructor(host: string, token = '') {
    if (host.endsWith('/')) {
      host = host.slice(0, -1)
    }

    this.host = host
    this.token = token
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
