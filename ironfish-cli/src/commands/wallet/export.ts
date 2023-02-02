/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spendingKeyToWords } from '@ironfish/rust-nodejs'
import { ErrorUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs'
import jsonColorizer from 'json-colorizer'
import path from 'path'
import { IronfishCommand } from '../../command'
import { ColorFlag, ColorFlagKey, RemoteFlags } from '../../flags'
import { LANGUAGE_KEYS, LANGUAGES, selectLanguage } from '../../utils/language'

export class ExportCommand extends IronfishCommand {
  static description = `Export an account`

  static flags = {
    ...RemoteFlags,
    [ColorFlagKey]: ColorFlag,
    local: Flags.boolean({
      default: false,
      description: 'Export an account without an online node',
    }),
    mnemonic: Flags.boolean({
      default: false,
      description: 'Export an account to a mnemonic 24 word phrase',
    }),
    language: Flags.enum({
      description: 'Language to use for mnemonic export',
      required: false,
      options: LANGUAGE_KEYS,
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
    const response = await client.exportAccount({ account })
    let output
    if (flags.language) {
      output = spendingKeyToWords(
        response.content.account.spendingKey,
        LANGUAGES[flags.language],
      )
    } else if (flags.mnemonic) {
      const language = await selectLanguage()
      output = spendingKeyToWords(response.content.account.spendingKey, language)
    } else {
      output = JSON.stringify(response.content.account, undefined, '   ')
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
        this.log(`Exported account ${response.content.account.name} to ${resolved}`)
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

    if (color && !flags.language && !flags.mnemonic) {
      output = jsonColorizer(output)
    }
    this.log(output)
  }
}
