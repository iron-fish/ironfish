/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey, wordsToSpendingKey } from '@ironfish/rust-nodejs'
import { ACCOUNT_SCHEMA_VERSION, Bech32m, JSONUtils, PromiseUtils } from '@ironfish/sdk'
import { AccountImport } from '@ironfish/sdk/src/wallet/walletdb/accountValue'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { CommandFlags } from '../../types'
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

    let account: AccountImport
    if (blob) {
      account = await this.stringToAccountImport(blob, flags)
    } else if (flags.path) {
      account = await this.importFile(flags.path, flags)
    } else if (process.stdin.isTTY) {
      account = await this.importTTY(flags)
    } else if (!process.stdin.isTTY) {
      account = await this.importPipe(flags)
    } else {
      CliUx.ux.error(`Invalid import type`)
    }

    if (!account.version) {
      account.version = ACCOUNT_SCHEMA_VERSION
    }

    if (!account.createdAt) {
      account.createdAt = null
    }

    const accountsResponse = await client.wallet.getAccounts()
    const duplicateAccount = accountsResponse.content.accounts.find(
      (accountName) => accountName === account.name,
    )
    // Offer the user to use a different name if a duplicate is found
    if (duplicateAccount && account.name) {
      this.log()
      this.log(`Found existing account with name '${account.name}'`)

      const name = await CliUx.ux.prompt('Enter a different name for the account', {
        required: true,
      })
      if (name === account.name) {
        this.error(`Entered the same name: '${name}'`)
      }

      account.name = name
    }

    const rescan = flags.rescan
    const result = await client.wallet.importAccount({ account, rescan })

    const { name, isDefaultAccount } = result.content
    this.log(`Account ${name} imported.`)

    if (isDefaultAccount) {
      this.log(`The default account is now: ${name}`)
    } else {
      this.log(`Run "ironfish wallet:use ${name}" to set the account as default`)
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

  static verifySpendingKey(spendingKey: string): string | null {
    try {
      return generateKeyFromPrivateKey(spendingKey)?.spendingKey ?? null
    } catch (e) {
      return null
    }
  }

  async stringToAccountImport(
    data: string,
    flags: CommandFlags<typeof ImportCommand>,
  ): Promise<AccountImport> {
    // bech32 encoded json
    const [decoded, _] = Bech32m.decode(data)
    if (decoded) {
      let data = JSONUtils.parse<AccountImport>(decoded)

      if (data.spendingKey) {
        data = {
          ...data,
          ...generateKeyFromPrivateKey(data.spendingKey),
        }
      }

      if (data.version === 1) {
        data.createdAt = null
        data.version = 2
      }

      if (flags.name) {
        data.name = flags.name
      }

      return data
    }

    // mnemonic or explicit spending key
    const spendingKey =
      ImportCommand.mnemonicWordsToKey(data) || ImportCommand.verifySpendingKey(data)

    if (spendingKey) {
      const name =
        flags.name ||
        (await CliUx.ux.prompt('Enter a new account name', {
          required: true,
        }))

      const key = generateKeyFromPrivateKey(spendingKey)
      return { name, version: ACCOUNT_SCHEMA_VERSION, createdAt: null, ...key }
    }

    // raw json
    try {
      let json = JSONUtils.parse<AccountImport>(data)

      if (json.spendingKey) {
        json = {
          ...json,
          ...generateKeyFromPrivateKey(json.spendingKey),
        }
      }

      if (json.version === 1) {
        json.createdAt = null
        json.version = 2
      }

      if (flags.name) {
        json.name = flags.name
      }

      return json
    } catch (e) {
      CliUx.ux.error(`Import failed for the given input: ${data}`)
    }
  }

  async importFile(
    path: string,
    flags: CommandFlags<typeof ImportCommand>,
  ): Promise<AccountImport> {
    const resolved = this.sdk.fileSystem.resolve(path)
    const data = await this.sdk.fileSystem.readFile(resolved)
    return this.stringToAccountImport(data.trim(), flags)
  }

  async importPipe(flags: CommandFlags<typeof ImportCommand>): Promise<AccountImport> {
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

    return this.stringToAccountImport(data, flags)
  }

  async importTTY(flags: CommandFlags<typeof ImportCommand>): Promise<AccountImport> {
    const userInput = await CliUx.ux.prompt(
      'Paste the output of wallet:export, or your spending key',
      {
        required: true,
      },
    )

    return await this.stringToAccountImport(userInput, flags)
  }
}
