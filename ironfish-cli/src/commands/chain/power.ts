/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Power extends IronfishCommand {
  static description = "Show the network's hash power (hash/s)"

  static flags = {
    ...LocalFlags,
  }

  static args = [
    {
      name: 'lookup',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      default: 120,
      required: false,
      description:
        'The number of blocks to look back to calculate the power. This value must be > 0',
    },
    {
      name: 'height',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      default: -1,
      required: false,
      description: 'Estimate network speed at the time of the given height',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(Power)
    const lookup = args.lookup as number | undefined
    const height = args.height as number | undefined

    await this.sdk.client.connect()

    this.log(`Calculating hash speed...`)

    const data = await this.sdk.client.getNetworkHashPower({ lookup: lookup, height: height })

    // Take a raw hash/s value and convert it to a magnitude-appropriate human readable string
    const hashRateUnits: { [numDivisions: number]: string } = {
      0: 'H/s',
      1: 'KH/s',
      2: 'MH/s',
      3: 'GH/s',
      4: 'TH/s',
      5: 'PH/s',
    }

    let numDivisions = 0
    let hashesPerSecond = data.content.hashesPerSecond

    while (hashesPerSecond > 1000) {
      hashesPerSecond /= 1000
      numDivisions += 1
    }

    const truncatedHashesPerSecond = Math.floor(hashesPerSecond * 100) / 100

    this.log(
      `The network is operating at ${truncatedHashesPerSecond} ${
        hashRateUnits[numDivisions]
      } over the last ${lookup ?? 120} blocks ending at ${
        height && height > 0 ? `block ${height}` : 'head'
      }.`,
    )
  }
}
