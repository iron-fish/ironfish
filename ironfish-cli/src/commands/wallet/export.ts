/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountFormat, ErrorUtils, LanguageUtils } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import fs from 'fs'
import jsonColorizer from 'json-colorizer'
import path from 'path'
import { IronfishCommand } from '../../command'
import { ColorFlag, ColorFlagKey, EnumLanguageKeyFlag, RemoteFlags } from '../../flags'
import { confirmOrQuit } from '../../ui'

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
    language: EnumLanguageKeyFlag({
      description: 'Language to use for mnemonic export',
      required: false,
      choices: LanguageUtils.LANGUAGE_KEYS,
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

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account to export',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ExportCommand)
    const { color, local, path: exportPath, viewonly: viewOnly } = flags
    const { account } = args

    if (flags.language) {
      flags.mnemonic = true
    }

    const format = flags.mnemonic
      ? AccountFormat.Mnemonic
      : flags.json
      ? AccountFormat.JSON
      : AccountFormat.Base64Json

    const client = await this.sdk.connectRpc(local)
    const response = await client.wallet.exportAccount({
      account,
      viewOnly,
      format,
      language: flags.language,
    })

    let output = response.content.account
    if (color && flags.json && !exportPath) {
      output = jsonColorizer(output)
    }

    if (exportPath) {
      let resolved = this.sdk.fileSystem.resolve(exportPath)

      try {
        const stats = await fs.promises.stat(resolved)

        if (stats.isDirectory()) {
          resolved = this.sdk.fileSystem.join(resolved, `ironfish-${account}.txt`)
        }

        if (fs.existsSync(resolved)) {
          await confirmOrQuit(
            `There is already an account backup at ${exportPath}` +
              `\n\nOverwrite the account backup with new file?`,
          )
        }

        await fs.promises.writeFile(resolved, output)
        this.log(`Exported account ${account} to ${resolved}`)
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
