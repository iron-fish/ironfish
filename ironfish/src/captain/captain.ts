/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-empty-function */

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
  chain: Blockchain<E, H, T, SE, SH, ST>

  private constructor(chain: Blockchain<E, H, T, SE, SH, ST>) {
    this.chain = chain
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
    chain = chain || (await Blockchain.new(db, strategy, logger, metrics))
    return new Captain(chain)
  }
}
