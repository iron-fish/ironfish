/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import * as SendSimulation from './01-send'
import * as StabilitySimulation from './02-stability'

/**
 * Interface that simulations must implement to be run by the framework.
 */
export interface Simulation {
  run(
    logger: Logger,
    options?: {
      persist: boolean
    },
  ): Promise<void>
}

/**
 * List of all simulations that can be run.
 */
export const SIMULATIONS: Simulation[] = [SendSimulation, StabilitySimulation]
