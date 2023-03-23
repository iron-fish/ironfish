/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { Command, Flags } from '@oclif/core'
import { Config } from '@oclif/core'
import { SIMULATIONS } from '../simulations'

export abstract class Start extends Command {
  static description = 'Start a simulation'
  static flags = {
    simulation: Flags.integer({ char: 's', required: true }),
  }

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Start)
    const logger = createRootLogger()

    const toRun = SIMULATIONS.at(flags.simulation - 1)
    if (!toRun) {
      logger.log(`could not find simulation ${flags.simulation}`)
      this.exit()
      return
    }

    logger.log('starting simulation')
    await toRun.run(logger)
    logger.log('simulation ended')
    this.exit()
  }
}
