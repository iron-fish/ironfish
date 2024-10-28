/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountFormat, ErrorUtils, LanguageUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import fs from 'fs'
import path from 'path'
import { IronfishCommand } from '../../command'
import { EnumLanguageKeyFlag, JsonFlags, RemoteFlags } from '../../flags'
import { checkWalletUnlocked, confirmOrQuit } from '../../ui'
import { useAccount } from '../../utils'

export class ExportCommand extends IronfishCommand {
  static description = `export an account`
  static enableJsonFlag = true

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to export',
    }),
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
      choices: LanguageUtils.LANGUAGE_KEYS,
    }),
    path: Flags.string({
      description: 'The path to export the account to',
    }),
    viewonly: Flags.boolean({
      default: false,
      description: 'Export an account as a view-only account',
    }),
  }

  async start(): Promise<unknown> {
    const { flags } = await this.parse(ExportCommand)
    const { local, path: exportPath, viewonly: viewOnly } = flags

    if (flags.language) {
      flags.mnemonic = true
    }

    const format = flags.mnemonic
      ? AccountFormat.Mnemonic
      : flags.json
      ? AccountFormat.JSON
      : AccountFormat.Base64Json

    const client = await this.connectRpc(local)
    await checkWalletUnlocked(client)

    const account = await useAccount(client, flags.account)

    const response = await client.wallet.exportAccount({
      account,
      viewOnly,
      format,
      language: flags.language,
    })

    const output = response.content.account

    if (exportPath) {
      let resolved = this.sdk.fileSystem.resolve(exportPath)

      try {
        const stats = await fs.promises.stat(resolved)

        if (stats.isDirectory()) {
          resolved = this.sdk.fileSystem.join(resolved, `ironfish-${account}.txt`)
        }

        if (fs.existsSync(resolved)) {
          await confirmOrQuit(
            `There is already an account backup at ${resolved}` +
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

    if (flags.json) {
      return output
    }
  }
}
