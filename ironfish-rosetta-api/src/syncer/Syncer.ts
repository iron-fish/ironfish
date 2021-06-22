/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SyncerError } from '../errors'
import { Indexer } from '../indexer'
import { RPCClient } from '../rpc'
import { BlockIdentifier } from '../types'
import { Logger } from '../utils/logger'

type SyncerState = { type: 'STARTED' } | { type: 'STOPPED' }
/**
 * Sync the Iron Fish chain blocks and pass it to the
 * indexer to store it in the database.
 *
 * It queries the NetworkStatus endpoint of the node to get the genesis block
 * and the heaviest block. It will then go backward from the heaviest block to
 * the genesis block and update the database on the way.
 * */
export class Syncer {
  indexer: Indexer
  rpc: RPCClient

  private _state: Readonly<SyncerState> = { type: 'STOPPED' }

  get state(): Readonly<SyncerState> {
    return this._state
  }

  setState(state: Readonly<SyncerState>): void {
    this._state = state
  }

  constructor(indexer: Indexer, rpcClient: RPCClient) {
    this.indexer = indexer
    this.rpc = rpcClient
  }

  static async new(): Promise<Syncer> {
    Logger.debug('SYNCER NEW')
    const rpc = await RPCClient.init()

    const indexer = await new Indexer().init()

    return new Syncer(indexer, rpc)
  }

  async start(): Promise<void> {
    Logger.debug('SYNCER START')
    if (this.isStarted()) {
      return
    }

    this.setState({ type: 'STARTED' })

    if (!this.rpc.sdk.client.isConnected) {
      const connected = await this.rpc.sdk.client.tryConnect()

      if (!connected) {
        Logger.error('Not connected to a node')
        this.stop()
        return
      }
    }

    Logger.debug('Syncer connected')

    const networkStatus = await this.rpc.sdk.client.getChainInfo()

    // no latest block
    if (!networkStatus || !networkStatus.content) {
      this.stop()
      return
    }

    const heaviestBlock = {
      index: Number(networkStatus.content.oldestBlockIdentifier.index),
      hash: networkStatus.content.oldestBlockIdentifier.hash,
    }
    const heaviestTail = {
      index: Number(networkStatus.content.genesisBlockIdentifier.index),
      hash: networkStatus.content.genesisBlockIdentifier.hash,
    }
    try {
      await this.sync(heaviestBlock, heaviestTail)
    } catch (err) {
      Logger.debug('Error while syncing', err)
    }

    this.stop()
  }

  isStarted(): boolean {
    return this.state.type === 'STARTED'
  }

  stop(): void {
    this.setState({ type: 'STOPPED' })
  }

  // Sync in reverse order from heaviest head to tail
  async sync(startBlock: BlockIdentifier, endBlock: BlockIdentifier): Promise<void> {
    Logger.debug(`Syncing from ${startBlock.index} to ${endBlock.index}`)
    let blockIdentifier = startBlock

    // check if genesis is the same
    const genesis = await this.indexer.getBlock(endBlock.index, endBlock.hash)
    if (!genesis) {
      Logger.debug(`Genesis changed - delete every block`)
      await this.indexer.deleteAllFromSequence(0)
    }

    Logger.debug(`Delete any block above ${startBlock.index}`)
    await this.indexer.deleteAllFromSequence(startBlock.index)

    while (startBlock.index > endBlock.index) {
      const isBlockExisting = await this.indexer.getBlock(
        Number(blockIdentifier.index),
        blockIdentifier.hash,
      )
      if (isBlockExisting) {
        Logger.debug(
          `Reached an existing block ${String(isBlockExisting.sequence)} ${
            isBlockExisting.hash
          }`,
        )
        break
      }

      const result = await this.rpc.sdk.client.getBlock(blockIdentifier)

      Logger.debug('Fetching ', blockIdentifier)

      if (!result || !result.content) {
        throw new SyncerError(
          `Cannot fetch block ${blockIdentifier.hash} ${blockIdentifier.index}`,
        )
      }

      const block = result.content

      await this.indexer.deleteAtSequence(Number(block.blockIdentifier.index))
      await this.indexer.addBlock(block)

      blockIdentifier = {
        hash: block.parentBlockIdentifier.hash,
        index: Number(block.parentBlockIdentifier.index),
      }
    }
  }
}
