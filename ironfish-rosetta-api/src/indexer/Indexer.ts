/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'reflect-metadata'
import { Repository } from 'typeorm'
import { Config, Block, Transaction, Note, Spend } from '../entity'
import { getManager } from 'typeorm'
import { Transaction as TransactionAPIType } from '../types'
import { GetBlockResponse } from 'ironfish'

export type IndexerConfigOptions = {
  lastBlockHash: string | null
}

/**
 * Wrapper around the database to manage the different database entities:
 * config: key value system to store the state of indexer/syncer
 * blocks: index every blocks
 * transactions: index every transaction for each blocks
 * */
export class Indexer {
  indexer: Indexer | null = null
  blockRepository: Repository<Block>
  configRepository: Repository<Config>
  transactionsRepository: Repository<Transaction>

  config: IndexerConfigOptions = {
    lastBlockHash: null,
  }

  constructor() {
    // Each entity has its own repository which handles all operations with its entity.
    // When dealing with entities, Repositories are more convenient to use than EntityManagers:
    this.configRepository = getManager().getRepository(Config)
    this.blockRepository = getManager().getRepository(Block)
    this.transactionsRepository = getManager().getRepository(Transaction)
  }

  async init(): Promise<Indexer> {
    const indexer = new Indexer()
    await indexer.loadConfig()

    return indexer
  }

  async setConfig(key: keyof IndexerConfigOptions, value: string): Promise<void> {
    if (!(key in this.config)) {
      throw 'Invalid key'
    }

    const config = await this.configRepository.findOne({ key })
    if (!config) {
      throw 'Key not found'
    }
    config.value = value
    await this.configRepository.save(config)
  }

  async loadConfig(): Promise<void> {
    const configs = await this.configRepository.find()

    if (!configs || configs.length <= 0) {
      return
    }

    for (const config of configs) {
      if (config.key in this.config) {
        this.config = {
          ...this.config,
          [config.key]: config.value,
        }
      }
    }
  }

  async getBlock(sequence?: number, hash?: string): Promise<Block | null> {
    const blockData = await this.blockRepository.findOne({
      where: {
        hash,
        sequence: sequence,
      },
    })

    return blockData || null
  }

  async deleteAtSequence(sequence: number): Promise<void> {
    await this.blockRepository.delete({ sequence: sequence })
  }

  async deleteAllFromSequence(sequence: number): Promise<void> {
    await this.blockRepository
      .createQueryBuilder()
      .delete()
      .where('sequence > :sequence', { sequence: sequence })
      .execute()
  }

  async addBlock(block: GetBlockResponse): Promise<Block> {
    const metadata = block.metadata as { size: number; difficulty: number }

    const blockToInsert = new Block()
    blockToInsert.hash = block.blockIdentifier.hash
    blockToInsert.sequence = Number(block.blockIdentifier.index)
    blockToInsert.previousBlockHash = block.parentBlockIdentifier.hash
    blockToInsert.size = metadata.size || 0
    blockToInsert.difficulty = metadata.difficulty || 0
    blockToInsert.timestamp = block.timestamp
    blockToInsert.transactionsCount = block.transactions.length

    const blockData = await this.blockRepository.save(blockToInsert)

    await this.addTransactions(blockData, block.transactions)

    return blockData
  }

  async addTransactions(
    blockData: Block,
    transactions: TransactionAPIType[],
  ): Promise<Transaction[]> {
    const transactionsToInsert: Transaction[] = transactions.map((transaction) => {
      const metadata = transaction.metadata as {
        size: number
        fee: number
        timestamp: number
        notes: Note[]
        spends: Spend[]
      }

      return {
        hash: transaction.transaction_identifier.hash,
        fee: metadata.fee || 0,
        size: metadata.size || 0,
        timestamp: blockData.timestamp,
        block: blockData,
        notes: metadata.notes,
        spends: metadata.spends,
      } as Transaction
    })

    return await this.transactionsRepository.save(transactionsToInsert)
  }
}
