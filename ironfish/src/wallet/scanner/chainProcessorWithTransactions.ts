/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { Blockchain } from '../../blockchain'
import { ChainProcessor } from '../../chainProcessor'
import { Event } from '../../event'
import { Logger } from '../../logger'
import { BlockHeader, Transaction } from '../../primitives'

export class ChainProcessorWithTransactions {
  chainProcessor: ChainProcessor
  onAdd = new Event<[{ header: BlockHeader; transactions: Transaction[] }]>()
  onRemove = new Event<[{ header: BlockHeader; transactions: Transaction[] }]>()

  get hash(): Buffer | null {
    return this.chainProcessor.hash
  }
  set hash(value: Buffer | null) {
    this.chainProcessor.hash = value
  }

  async update(options?: { signal?: AbortSignal }): Promise<{ hashChanged: boolean }> {
    return this.chainProcessor.update(options)
  }

  constructor(options: {
    logger?: Logger
    chain: Blockchain
    head: Buffer | null
    maxQueueSize?: number | null
  }) {
    this.chainProcessor = new ChainProcessor(options)

    this.chainProcessor.onAdd.on(async (header: BlockHeader) => {
      const block = await this.chainProcessor.chain.getBlock(header)
      Assert.isNotNull(block)
      const transactions = block.transactions
      await this.onAdd.emitAsync({ header, transactions })
    })

    this.chainProcessor.onRemove.on(async (header: BlockHeader) => {
      const block = await this.chainProcessor.chain.getBlock(header)
      Assert.isNotNull(block)
      const transactions = block.transactions
      await this.onRemove.emitAsync({ header, transactions })
    })
  }
}
