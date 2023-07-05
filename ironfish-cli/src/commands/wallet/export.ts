/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spendingKeyToWords } from '@ironfish/rust-nodejs'
import { Assert, Bech32m, ErrorUtils, LanguageKey, LanguageUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs'
import inquirer from 'inquirer'
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
    mnemonic: Flags.boolean({
      default: false,
      description: 'Export an account to a mnemonic 24 word phrase',
    }),
    language: Flags.enum({
      description: 'Language to use for mnemonic export',
      required: false,
      options: LanguageUtils.LANGUAGE_KEYS,
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output the account as JSON, rather than the default bech32',
    }),
    path: Flags.string({
      description: 'The path to export the account to',
      required: false,
    }),
    viewonly: Flags.boolean({
      default: false,
      description: 'Export an account as a view-only account',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to export',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ExportCommand)
    const { color, local } = flags
    const account = args.account as string
    const exportPath = flags.path
    const viewOnly = flags.viewonly

    if (flags.language) {
      flags.mnemonic = true
    }

    const client = await this.sdk.connectRpc(local)
    const response = await client.wallet.exportAccount({ account: account, viewOnly: viewOnly })
    let output

    if (flags.mnemonic) {
      let languageCode = flags.language ? LanguageUtils.LANGUAGES[flags.language] : null

      if (languageCode == null) {
        languageCode = LanguageUtils.inferLanguageCode()

        if (languageCode !== null) {
          CliUx.ux.info(
            `Detected Language as '${LanguageUtils.languageCodeToKey(
              languageCode,
            )}', exporting:`,
          )
        }
      }

      if (languageCode == null) {
        CliUx.ux.info(`Could not detect your language, please select language for export`)
        const response = await inquirer.prompt<{
          language: LanguageKey
        }>([
          {
            name: 'language',
            message: `Select your language`,
            type: 'list',
            choices: LanguageUtils.LANGUAGE_KEYS,
          },
        ])
        languageCode = LanguageUtils.LANGUAGES[response.language]
      }
      Assert.isTruthy(
        response.content.account.spendingKey,
        'The account you are trying to export does not have a spending key, therefore a mnemonic cannot be generated for it',
      )
      output = spendingKeyToWords(response.content.account.spendingKey, languageCode)
    } else if (flags.json) {
      output = JSON.stringify(response.content.account, undefined, '    ')

      if (color && flags.json && !exportPath) {
        output = jsonColorizer(output)
      }
    } else {
      output = Bech32m.encode(JSON.stringify(response.content.account), 'ironfishaccount00000')
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

    this.log(output)
  }
}
