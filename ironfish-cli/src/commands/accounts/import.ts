/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RemoteFlags } from '../../flags'
import { IronfishCommand } from '../../command'
import { JSONUtils, PromiseUtils, Account } from 'ironfish'
import fs from 'fs'
import { flags } from '@oclif/command'

export class ImportCommand extends IronfishCommand {
  static description = `Import an account`

  static flags = {
    ...RemoteFlags,
    rescan: flags.boolean({
      allowNo: true,
      default: true,
      description: 'rescan the blockchain once the account is imported',
    }),
  }

  static args = [
    {
      name: 'path',
      parse: (input: string): string => input.trim(),
      required: false,
      description: 'a path to export the account to',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = this.parse(ImportCommand)
    const importPath = args.path as string | undefined

    await this.sdk.client.connect()

    let data: string | null = null

    if (importPath) {
      const resolved = this.sdk.fileSystem.resolve(importPath)
      data = fs.readFileSync(resolved, 'utf8')
    } else if (process.stdin) {
      data = ''

      const onData = (dataIn: string): void => {
        data += dataIn
      }

      process.stdin.setEncoding('utf8')
      process.stdin.on('data', onData)
      while (!process.stdin.readableEnded) {
        await PromiseUtils.sleep(100)
      }
      process.stdin.off('data', onData)
    }

    if (data === null) {
      this.log('No account to import provided')
      this.exit(1)
    }

    const account = JSONUtils.parse<Account>(data)

    const result = await this.sdk.client.importAccount({
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
}
