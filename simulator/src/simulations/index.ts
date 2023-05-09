/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import { Simulator } from '../simulator'
import * as getAccountTransaction from './getAccountTransaction'
import * as send from './send'
import * as stability from './stability'

/**
 * Interface that simulations must implement to be run by the framework.
 */
export interface Simulation {
  run(simulator: Simulator, logger: Logger): Promise<void>
}

/**
 * Map of all simulations that can be run. Add your simulation here to run it using the `simulator start` command.
 */
export const SIMULATIONS: { [name: string]: Simulation | undefined } = {
  send,
  stability,
  getAccountTransaction,
}
