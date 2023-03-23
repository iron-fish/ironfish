/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import * as SendSimulation from './01-send'
import * as StabilitySimulation from './02-stability'

interface Simulation {
  run(logger: Logger): Promise<void>
}

export const SIMULATIONS: Simulation[] = [SendSimulation, StabilitySimulation]
