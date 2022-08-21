/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

const DEFAULT_SPEED = 1

export class EstimateFeesCommand extends IronfishCommand {
  static description = `Estimate fee for send transaction`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'speed',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'expected number of blocks for your transaction to be mined',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(EstimateFeesCommand)
    const speed = args.speed as number | null

    const targetConfirmSpeed = speed || DEFAULT_SPEED

    const client = await this.sdk.connectRpc()

    try {
      const response = await client.estimateFees({ targetConfirmSpeed })

      this.log(
        `To be mined in the next ${targetConfirmSpeed} blocks, the recommended fee is ${response.content.target} ORE\n
More fee status from mempool:\nThe highest transaction fee: ${response.content.highestFee} ORE\nRecommended fee to be mined in the next block: ${response.content.high} ORE\nRecommended fee to be mined in the next 5 blocks: ${response.content.medium} ORE\nRecommended fee to be mined in the next 10 blocks: ${response.content.slow} ORE`,
      )
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(error.message)
      }

      this.exit(1)
    }
  }
}
