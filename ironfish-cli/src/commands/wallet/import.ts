/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { wordsToSpendingKey } from '@ironfish/rust-nodejs'
import { AccountImport, Bech32m, JSONUtils, PromiseUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
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
    path: Flags.string({
      description: 'the path to the file containing the account to import',
      flagName: 'path',
    }),
  }

  static args = [
    {
      name: 'blob',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The copy-pasted output of wallet:export',
    },
  ]

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
    const blob = args.blob as string | undefined

    const client = await this.sdk.connectRpc()

    let account: AccountImport | null = null
    if (blob) {
      account = await this.stringToAccountImport(blob)
    } else if (flags.path) {
      account = await this.importFile(flags.path)
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
  async stringToAccountImport(data: string): Promise<AccountImport | null> {
    // try bech32 first
    const [decoded, _] = Bech32m.decode(data)
    if (decoded) {
      return JSONUtils.parse<AccountImport>(decoded)
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
      return null // this will be caught in the calling function
    }
  }

  async importFile(path: string): Promise<AccountImport | null> {
    const resolved = this.sdk.fileSystem.resolve(path)
    const data = await this.sdk.fileSystem.readFile(resolved)
    return this.stringToAccountImport(data)
  }

  async importPipe(): Promise<AccountImport | null> {
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

    const output = await this.stringToAccountImport(userInput)

    if (output === null) {
      CliUx.ux.error(
        'Failed to decode the account from the provided input, please continue with the manual input below',
        {
          exit: false,
        },
      )
    } else {
      return output
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
