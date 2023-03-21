/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { Simulator } from '../../automated-test-network'
import { createSimulatorLogger } from '../../automated-test-network/logger'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Start extends IronfishCommand {
  static description = 'Start the test network'

  static flags = {
    ...LocalFlags,
    simulation: Flags.integer({
      required: true,
      description: 'The simulation to run',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Start)

    const logger = createSimulatorLogger()

    const simulator = new Simulator(logger)

    try {
      await simulator.run(flags.simulation)
    } catch (err) {
      logger.error(String(err))
    }
  }
}
