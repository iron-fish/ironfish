/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-empty-function */

import { BlockSerde } from '../blockchain/block'
import Strategy from '../strategy/strategy'
import Transaction from '../strategy/transaction'
import { MetricsMonitor } from '../metrics'
import { createRootLogger, Logger } from '../logger'
import { JsonSerializable } from '../serde'

import { IDatabase } from '../storage'
import Blockchain from '../blockchain'

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
  logger: Logger
  metrics: MetricsMonitor

  private constructor(
    chain: Blockchain<E, H, T, SE, SH, ST>,
    logger: Logger,
    metrics: MetricsMonitor,
  ) {
    this.metrics = metrics
    this.strategy = chain.strategy
    this.chain = chain
    this.blockSerde = chain.strategy.blockSerde
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
    strategy: Strategy<E, H, T, SE, SH, ST>,
    chain?: Blockchain<E, H, T, SE, SH, ST>,
    logger: Logger = createRootLogger(),
    metrics?: MetricsMonitor,
  ): Promise<Captain<E, H, T, SE, SH, ST>> {
    logger = logger.withTag('captain')
    metrics = metrics || new MetricsMonitor(logger)
    chain = chain || (await Blockchain.new(db, strategy, logger, metrics))
    return new Captain(chain, logger, metrics)
  }
}
