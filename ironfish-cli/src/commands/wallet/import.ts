/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { wordsToSpendingKey } from '@ironfish/rust-nodejs'
import { AccountImport, JSONUtils, PromiseUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { bech32m } from 'bech32'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { LANGUAGE_VALUES } from '../../utils/language'

export class ImportCommand extends IronfishCommand {
  static description = `Import an account`

  static flags = {
    ...RemoteFlags,
    rescan: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Rescan the blockchain once the account is imported',
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

  static bech32ToJSON(bech32: string): string | null {
    try {
      const decodedOutput = bech32m.decode(bech32, 1023)
      const decodedWords = decodedOutput.words
      const decodedBytes = bech32m.fromWords(decodedWords)
      return Buffer.from(decodedBytes).toString()
    } catch (e) {
      return null
    }
  }

  static mnemonicWordsToKey(mnemonic: string): string | null {
    let spendingKey: string | null = null
    // There is no way to export size from MnemonicType in Rust (imperative)
    if (mnemonic.trim().split(/\s+/).length !== 24) {
      return null
    }
    for (const language of LANGUAGE_VALUES) {
      try {
        spendingKey = wordsToSpendingKey(mnemonic.trim(), language)
        return spendingKey
      } catch (e) {
        continue
      }
    }
    CliUx.ux.error(
      `Detected mnemonic input, but the import failed. 
      Please verify the input text or use a different method to import wallet`,
    )
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(ImportCommand)
    const importPath = args.path as string | undefined

    const client = await this.sdk.connectRpc()

    let account: AccountImport | null = null
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
      this.log(`Run "ironfish wallet:use ${name}" to set the account as default`)
    }
  }
  async stringToAccountImport(data: string): Promise<AccountImport> {
    // try bech32 first
    const bech32 = ImportCommand.bech32ToJSON(data)
    if (bech32) {
      return JSONUtils.parse<AccountImport>(bech32)
    }
    // then try mnemonic
    const spendingKey = ImportCommand.mnemonicWordsToKey(data)
    if (spendingKey) {
      const name = await CliUx.ux.prompt('Enter the account name', {
        required: true,
      })
      return {
        name,
        spendingKey,
      }
    }
    // last try json
    try {
      return JSONUtils.parse<AccountImport>(data)
    } catch (e) {
      throw new Error(
        'Could not detect a valid account format, please verify your account info input',
      )
    }
  }

  async importFile(path: string): Promise<AccountImport> {
    const resolved = this.sdk.fileSystem.resolve(path)
    const data = await this.sdk.fileSystem.readFile(resolved)
    return this.stringToAccountImport(data)
  }

  async importPipe(): Promise<AccountImport> {
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

    return this.stringToAccountImport(data)
  }

  async importTTY(): Promise<AccountImport> {
    const userInput = await CliUx.ux.prompt('Paste the output of wallet:export', {
      required: true,
    })
    try {
      return this.stringToAccountImport(userInput)
    } catch (e) {
      CliUx.ux.error(
        'Failed to decode the account from the provided input, please continue with the manual input below',
        {
          exit: false,
        },
      )
    }

    const accountName = await CliUx.ux.prompt('Enter the account name', {
      required: true,
    })

    const spendingKey = await CliUx.ux.prompt('Enter the account spending key', {
      required: true,
    })

    return {
      name: accountName,
      spendingKey: spendingKey,
    }
  }
}
