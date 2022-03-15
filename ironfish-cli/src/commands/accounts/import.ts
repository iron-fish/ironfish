/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { JSONUtils, PromiseUtils, SerializedAccount } from '@ironfish/sdk'
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
      description: 'rescan the blockchain once the account is imported',
    }),
  }

  static args = [
    {
      name: 'path',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'a path to import the account from',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ImportCommand)
    const importPath = args.path as string | undefined

    const client = await this.sdk.connectRpc()

    let account: SerializedAccount | null = null
    if (importPath) {
      account = await this.importFile(importPath)
    } else if (process.stdin.isTTY) {
      account = await this.importTTY()
    } else if (!process.stdin.isTTY) {
      account = await this.importPipe()
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
      this.log(`Run "ironfish accounts:use ${name}" to set the account as default`)
    }
  }

  async importFile(path: string): Promise<SerializedAccount> {
    const resolved = this.sdk.fileSystem.resolve(path)
    const data = await this.sdk.fileSystem.readFile(resolved)
    return JSONUtils.parse<SerializedAccount>(data)
  }

  async importPipe(): Promise<SerializedAccount> {
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

    return JSONUtils.parse<SerializedAccount>(data)
  }

  async importTTY(): Promise<SerializedAccount> {
    const accountName = (await CliUx.ux.prompt('Enter the account name', {
      required: true,
    })) as string

    const spendingKey = (await CliUx.ux.prompt('Enter the account spending key', {
      required: true,
    })) as string

    const incomingViewKey = (await CliUx.ux.prompt('Enter the account incoming view key', {
      required: true,
    })) as string

    const outgoingViewKey = (await CliUx.ux.prompt('Enter the account outgoing view key', {
      required: true,
    })) as string

    const publicAddress = (await CliUx.ux.prompt('Enter the account public address', {
      required: true,
    })) as string

    return {
      name: accountName,
      spendingKey: spendingKey,
      incomingViewKey: incomingViewKey,
      outgoingViewKey: outgoingViewKey,
      publicAddress: publicAddress,
      rescan: null,
    }
  }
}
