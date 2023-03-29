/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { CliUx, Command, Config } from '@oclif/core'
import { Flags } from '@oclif/core'
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

  static flags = {
    persist: Flags.boolean({
      char: 'p',
      required: false,
      description: 'Persist the data_dir beyond the simulation',
      default: false,
    }),
  }

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Start)

    const simulation = args.simulation as number | null

    const persist = flags.persist

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

    CliUx.ux.action.start(`running simulation ${simulation}`)
    await toRun.run(logger, { persist })
    CliUx.ux.action.start(`stop simulation ${simulation}`)
    this.exit()
  }
}

function parseNumber(input: string): number | null {
  const parsed = Number(input)
  return isNaN(parsed) ? null : parsed
}
