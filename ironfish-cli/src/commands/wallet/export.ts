/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs'
import jsonColorizer from 'json-colorizer'
import path from 'path'
import { IronfishCommand } from '../../command'
import { ColorFlag, ColorFlagKey, RemoteFlags } from '../../flags'

export class ExportCommand extends IronfishCommand {
  static description = `Export an account`

  static flags = {
    ...RemoteFlags,
    [ColorFlagKey]: ColorFlag,
    local: Flags.boolean({
      default: false,
      description: 'Export an account without an online node',
    }),
    base58: Flags.boolean({
      allowNo: true,
      default: false,
      description:
        'Export the account using base58 encoding, rather than the default hex encoding',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to export',
    },
    {
      name: 'path',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The path to export the account to',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ExportCommand)
    const { color, local } = flags
    const account = args.account as string
    const exportPath = args.path as string | undefined

    const client = await this.sdk.connectRpc(local)
    let output = ''
    let name = ''
    if (flags.base58) {
      const response = await client.exportAccountBase58({ account })
      output = JSON.stringify(response.content.account, undefined, '   ')
      name = response.content.account.name
    } else {
      const response = await client.exportAccount({ account })
      output = JSON.stringify(response.content.account, undefined, '   ')
      name = response.content.account.name
    }

    if (exportPath) {
      let resolved = this.sdk.fileSystem.resolve(exportPath)

      try {
        const stats = await fs.promises.stat(resolved)

        if (stats.isDirectory()) {
          resolved = this.sdk.fileSystem.join(resolved, `ironfish-${account}.txt`)
        }

        if (fs.existsSync(resolved)) {
          this.log(`There is already an account backup at ${exportPath}`)

          const confirmed = await CliUx.ux.confirm(
            `\nOverwrite the account backup with new file?\nAre you sure? (Y)es / (N)o`,
          )

          if (!confirmed) {
            this.exit(1)
          }
        }

        await fs.promises.writeFile(resolved, output)
        this.log(`Exported account ${name} to ${resolved}`)
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
