/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { Command } from '@oclif/core'
import { Config } from '@oclif/core'
import { SIMULATIONS } from '../simulations'

export abstract class Start extends Command {
  static description = 'Start a simulation'

  static args = [
    {
      name: 'simulation',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      required: true,
      description: 'The simulation to run',
    },
  ]

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Start)
    const simulation = args.simulation as number | null
    const logger = createRootLogger()

    if (simulation === null) {
      logger.log(`simulation argument is invalid`)
      this.exit()
      return
    }

    const toRun = SIMULATIONS.at(simulation - 1)
    if (!toRun || simulation < 1) {
      logger.log(`could not find simulation ${simulation}`)
      this.exit()
      return
    }

    logger.log(`starting simulation ${simulation}`)
    await toRun.run(logger)
    logger.log('simulation ended')
    this.exit()
  }
}

function parseNumber(input: string): number | null {
  const parsed = Number(input)
  return isNaN(parsed) ? null : parsed
}
