/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { CliUx, Command, Config } from '@oclif/core'
import { Flags } from '@oclif/core'
import { SIMULATIONS } from '../simulations'
import { Simulator } from '../simulator'

export abstract class Start extends Command {
  static description = 'Start a simulation'

  static args = [
    {
      name: 'simulation',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: `The name of the simulation to run, one of: ${Object.keys(SIMULATIONS).join(
        ', ',
      )}`,
    },
  ]

  static flags = {
    persist: Flags.boolean({
      char: 'p',
      required: false,
      description: 'Whether the data_dir should persist beyond the simulation',
      default: false,
    }),
    duration: Flags.integer({
      char: 'd',
      required: false,
      description: 'Duration the simulation should run for',
    }),
    verbose: Flags.boolean({
      char: 'v',
      required: false,
      description: 'Log all node event to the console by default',
    }),
  }

  constructor(argv: string[], config: Config) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Start)

    const simName = args.simulation as string
    const simulation = SIMULATIONS[simName]

    const { persist, duration } = flags

    const logger = createRootLogger()

    if (simulation === undefined) {
      logger.log(`could not find simulation ${simName}`)
      this.exit(1)
      return
    }

    // TODO: the spinner does not work when trying to pipe logs into a logfile, it will just hang
    // If you want logs to persist, i.e. via `simulator start 1 2>&1 | tee ~/i/logs/run_1.log` you will
    // need to remove the spinner
    CliUx.ux.action.start(`running simulation ${simName}`)

    // The simulator is created here because oclif catches errors so we can't throw them
    // and handle `uncaughtException` in the simulator. Having this try-catch block is a workaround
    // to ensure the simulator gracefully exits when an error occurs.
    const simulator = new Simulator(logger, {
      persist,
      duration,
      verboseLogging: flags.verbose,
    })

    logger.log(`created simulation ${simulator.simulationID}`)

    try {
      await simulation.run(simulator, logger)
    } catch (e) {
      logger.error(
        `simulation ${simulator.simulationID} encountered ${String(e)}, shutting down...`,
      )
      simulator.exit(1)
    }

    CliUx.ux.action.stop(`stop simulation ${simName}`)
    this.exit(0)
  }
}
