/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

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

  static args = [
    {
      name: 'blob',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The copy-pasted output of wallet:export; or, a raw spending key',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ImportCommand)
    const blob = args.blob as string | undefined

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
      account = await this.importFile(flags.path)
    } else if (process.stdin.isTTY) {
      account = await this.importTTY()
    } else if (!process.stdin.isTTY) {
      account = await this.importPipe()
    } else {
      CliUx.ux.error(`Invalid import type`)
    }

    const accountsResponse = await client.wallet.getAccounts()
    const duplicateAccount = accountsResponse.content.accounts.find(
      (accountName) => accountName === flags.name,
    )
    // Offer the user to use a different name if a duplicate is found
    if (duplicateAccount && flags.name) {
      this.log()
      this.log(`Found existing account with name '${flags.name}'`)

      const name = await CliUx.ux.prompt('Enter a different name for the account', {
        required: true,
      })
      if (name === flags.name) {
        this.error(`Entered the same name: '${name}'`)
      }

      flags.name = name
    }

    const result = await client.wallet.importAccount({
      account,
      rescan: flags.rescan,
      name: flags.name,
    })

    const { name, isDefaultAccount } = result.content
    this.log(`Account ${name} imported.`)

    if (isDefaultAccount) {
      this.log(`The default account is now: ${name}`)
    } else {
      this.log(`Run "ironfish wallet:use ${name}" to set the account as default`)
    }
  }

  async importFile(path: string): Promise<string> {
    const resolved = this.sdk.fileSystem.resolve(path)
    const data = await this.sdk.fileSystem.readFile(resolved)
    return data.trim()
  }

  async importPipe(): Promise<string> {
    let data = ''

    const onData = (dataIn: string): void => {
      data += dataIn.trim()
    }

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', onData)

    while (!process.stdin.readableEnded) {
      await PromiseUtils.sleep(100)
    }

    process.stdin.off('data', onData)

    return data
  }

  async importTTY(): Promise<string> {
    const userInput = await CliUx.ux.prompt(
      'Paste the output of wallet:export, or your spending key',
      {
        required: true,
      },
    )

    return userInput.trim()
  }
}
