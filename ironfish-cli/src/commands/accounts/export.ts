/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import fs from 'fs'
import { ErrorUtils } from 'ironfish'
import jsonColorizer from 'json-colorizer'
import path from 'path'
import { IronfishCommand } from '../../command'
import { ColorFlag, ColorFlagKey, RemoteFlags } from '../../flags'

export class ExportCommand extends IronfishCommand {
  static description = `Export an account`

  static flags = {
    ...RemoteFlags,
    [ColorFlagKey]: ColorFlag,
    local: flags.boolean({
      default: false,
      description: 'Export an account without an online node',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): string => input.trim(),
      required: false,
      description: 'name of the account to export',
    },
    {
      name: 'path',
      parse: (input: string): string => input.trim(),
      required: false,
      description: 'a path to export the account to',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = this.parse(ExportCommand)
    const { color, local } = flags
    const account = args.account as string
    const exportPath = args.path as string | undefined

    const client = await this.sdk.connectRpc(local)
    const response = await client.exportAccount({ account })

    let output = JSON.stringify(response.content.account, undefined, '   ')

    if (exportPath) {
      const resolved = this.sdk.fileSystem.resolve(exportPath)

      try {
        const stats = await fs.promises.stat(resolved)
        if (stats.isDirectory()) {
          await fs.promises.writeFile(
            this.sdk.fileSystem.join(resolved, `ironfish-${account}.txt`),
            output,
          )
        }
      } catch (err: unknown) {
        if (ErrorUtils.isNoEntityError(err)) {
          await fs.promises.mkdir(path.dirname(resolved), { recursive: true })
          await fs.promises.writeFile(resolved, output)
        } else {
          throw err
        }
      }

      return
    }

    if (color) {
      output = jsonColorizer(output)
    }
    this.log(output)
  }
}
