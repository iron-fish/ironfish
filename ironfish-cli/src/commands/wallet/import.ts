/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RPC_ERROR_CODES, RpcRequestError } from '@ironfish/sdk'
import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { importFile, importPipe, longPrompt } from '../../utils/input'

export class ImportCommand extends IronfishCommand {
  static description = `Import an account`

  static flags = {
    ...RemoteFlags,
    rescan: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Rescan the blockchain once the account is imported',
    }),
    path: Flags.string({
      description: 'the path to the file containing the account to import',
    }),
    name: Flags.string({
      description: 'the name to use for the account',
    }),
  }

  static args = {
    blob: Args.string({
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The copy-pasted output of wallet:export; or, a raw spending key',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ImportCommand)
    const blob = args.blob

    const client = await this.sdk.connectRpc()

    let account: string

    if (blob && blob.length !== 0 && flags.path && flags.path.length !== 0) {
      this.error(
        `Your command includes an unexpected argument. Please pass either --path or the output of wallet:export.`,
      )
    }

    if (blob) {
      account = blob
    } else if (flags.path) {
      account = await importFile(this.sdk.fileSystem, flags.path)
    } else if (process.stdin.isTTY) {
      account = await longPrompt('Paste the output of wallet:export, or your spending key', {
        required: true,
      })
    } else if (!process.stdin.isTTY) {
      account = await importPipe()
    } else {
      ux.error(`Invalid import type`)
    }

    const accountsResponse = await client.wallet.getAccounts()
    const duplicateAccount = accountsResponse.content.accounts.find(
      (accountName) => accountName === flags.name,
    )
    // Offer the user to use a different name if a duplicate is found
    if (duplicateAccount && flags.name) {
      this.log()
      this.log(`Found existing account with name '${flags.name}'`)

      const name = await ux.prompt('Enter a different name for the account', {
        required: true,
      })
      if (name === flags.name) {
        this.error(`Entered the same name: '${name}'`)
      }

      flags.name = name
    }

    let result

    while (!result) {
      try {
        result = await client.wallet.importAccount({
          account,
          rescan: flags.rescan,
          name: flags.name,
        })
      } catch (e) {
        if (
          e instanceof RpcRequestError &&
          (e.code === RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME.toString() ||
            e.code === RPC_ERROR_CODES.IMPORT_ACCOUNT_NAME_REQUIRED.toString())
        ) {
          const message = 'Enter a name for the account'

          if (e.code === RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME.toString()) {
            this.log()
            this.log(e.codeMessage)
          }

          const name = await ux.prompt(message, {
            required: true,
          })
          if (name === flags.name) {
            this.error(`Entered the same name: '${name}'`)
          }

          flags.name = name
          continue
        }

        throw e
      }
    }

    const { name, isDefaultAccount } = result.content
    this.log(`Account ${name} imported.`)

    if (isDefaultAccount) {
      this.log(`The default account is now: ${name}`)
    } else {
      this.log(`Run "ironfish wallet:use ${name}" to set the account as default`)
    }
  }
}
