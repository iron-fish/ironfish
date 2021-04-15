/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-empty-function */

import { default as Block, BlockSerde } from '../blockchain/block'
import Strategy from '../strategy/strategy'
import Transaction from '../strategy/transaction'
import { Event } from '../event'
import { MetricsMonitor } from '../metrics'
import { createRootLogger, Logger } from '../logger'
import { JsonSerializable } from '../serde'

import { IDatabase } from '../storage'
import Blockchain from '../blockchain'
import { WorkerPool } from '../workerPool'

export class Captain<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  strategy: Strategy<E, H, T, SE, SH, ST>
  chain: Blockchain<E, H, T, SE, SH, ST>
  blockSerde: BlockSerde<E, H, T, SE, SH, ST>
  workerPool: WorkerPool
  logger: Logger
  metrics: MetricsMonitor

  /**
   * Emitted when a new block has been created, such as
   * when a new block has been mined.
   */
  onNewBlock = new Event<[Block<E, H, T, SE, SH, ST>]>()

  private constructor(
    chain: Blockchain<E, H, T, SE, SH, ST>,
    workerPool: WorkerPool,
    logger: Logger,
    metrics: MetricsMonitor,
  ) {
    this.metrics = metrics
    this.strategy = chain.strategy
    this.chain = chain
    this.blockSerde = new BlockSerde(chain.strategy)
    this.workerPool = workerPool
    this.logger = logger
  }

  static async new<
    E,
    H,
    T extends Transaction<E, H>,
    SE extends JsonSerializable,
    SH extends JsonSerializable,
    ST
  >(
    db: IDatabase,
    workerPool: WorkerPool,
    strategy: Strategy<E, H, T, SE, SH, ST>,
    chain?: Blockchain<E, H, T, SE, SH, ST>,
    logger: Logger = createRootLogger(),
    metrics?: MetricsMonitor,
  ): Promise<Captain<E, H, T, SE, SH, ST>> {
    logger = logger.withTag('captain')
    metrics = metrics || new MetricsMonitor(logger)
    chain = chain || (await Blockchain.new(db, strategy, logger, metrics))
    return new Captain(chain, workerPool, logger, metrics)
  }

  /**
   * Submit a freshly mined block to be forwarded to the p2p network
   *
   * This method would only be used by miners.
   * @param block the block that has been mined by an external miner or pool.
   */
  emitBlock(block: Block<E, H, T, SE, SH, ST>): void {
    this.onNewBlock.emit(block)
  }
}
