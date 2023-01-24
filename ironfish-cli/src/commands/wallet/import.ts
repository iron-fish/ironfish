/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountImport, JSONUtils, PromiseUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import bs58safe from 'bs58safe'

export class ImportCommand extends IronfishCommand {
  static description = `Import an account`

  static flags = {
    ...RemoteFlags,
    rescan: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Rescan the blockchain once the account is imported',
    }),
    base58: Flags.boolean({
      allowNo: true,
      default: false,
      description: 'Import the account using base58 encoding, rather than the default hex encoding',
    }),
  }

  static args = [
    {
      name: 'path',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The path to import the account from',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ImportCommand)
    const importPath = args.path as string | undefined

    const client = await this.sdk.connectRpc()

    let account: AccountImport | null = null
    if (importPath) {
      account = await this.importFile(importPath, flags.base58)
    } else if (process.stdin.isTTY) {
      account = await this.importTTY(flags.base58)
    } else if (!process.stdin.isTTY) {
      account = await this.importPipe(flags.base58)
    }

    if (account === null) {
      this.log('No account to import provided')
      return this.exit(1)
    }

    const result = await client.importAccount({
      account: account,
      rescan: flags.rescan,
    })

    const { name, isDefaultAccount } = result.content
    this.log(`Account ${name} imported.`)

    if (isDefaultAccount) {
      this.log(`The default account is now: ${name}`)
    } else {
      this.log(`Run "ironfish wallet:use ${name}" to set the account as default`)
    }
  }

  async importFile(path: string, useBase58: boolean): Promise<AccountImport> {
    const resolved = this.sdk.fileSystem.resolve(path)
    const data = await this.sdk.fileSystem.readFile(resolved)
    if (useBase58) {
      return JSONUtils.parse<AccountImport>(bs58safe.decode(data).toString('utf8'))
    }
    return JSONUtils.parse<AccountImport>(data)
  }

  async importPipe(useBase58: boolean): Promise<AccountImport> {
    let data = ''

    const onData = (dataIn: string): void => {
      data += dataIn
    }

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', onData)

    while (!process.stdin.readableEnded) {
      await PromiseUtils.sleep(100)
    }

    process.stdin.off('data', onData)
    if (useBase58) {
      return JSONUtils.parse<AccountImport>(bs58safe.decode(data).toString('utf8'))
    }
    return JSONUtils.parse<AccountImport>(data)
  }

  async importTTY(useBase58: boolean): Promise<AccountImport> {
    const accountName = await CliUx.ux.prompt('Enter the account name', {
      required: true,
    })

    const spendingKey = await CliUx.ux.prompt('Enter the account spending key', {
      required: true,
    })

    return {
      name: accountName,
      spendingKey: useBase58 ? bs58safe.decode(spendingKey).toString('utf8') : spendingKey,
    }
  }
}
