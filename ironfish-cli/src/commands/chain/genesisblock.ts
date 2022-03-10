/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GenesisBlockInfo, IJSON, makeGenesisBlock } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class GenesisBlockCommand extends IronfishCommand {
  static description = 'Create and serialize a genesis block'

  static hidden = true

  static flags = {
    ...LocalFlags,
    account: Flags.string({
      char: 'a',
      required: false,
      default: 'IronFishGenesisAccount',
      description: 'the name of the account to use for keys to assign the genesis block to',
    }),
    coins: Flags.integer({
      char: 'c',
      required: false,
      default: 4200000000000000,
      description: 'The amount of coins to generate',
    }),
    memo: Flags.string({
      char: 'm',
      required: false,
      default: 'Genesis Block',
      description: 'The memo of the block',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(GenesisBlockCommand)

    const node = await this.sdk.node({ autoSeed: false })
    await node.openDB()

    if (!node.chain.isEmpty) {
      this.log(
        `The database ${node.config.get(
          'databaseName',
        )} must be empty to create a genesis block.`,
      )
      this.exit(0)
    }

    let account = null
    if (flags.account !== null) {
      account = node.accounts.getAccountByName(flags.account)
    }

    if (account === null) {
      const name = `IronFishGenesisAccount` // Faucet depends on the name
      account = await node.accounts.createAccount(name)
      this.log(`Creating account ${account.name} to assign the genesis block to.`)
    }

    const info: GenesisBlockInfo = {
      timestamp: Date.now(),
      memo: flags.memo,
      allocations: [
        {
          publicAddress: account.publicAddress,
          amount: flags.coins,
        },
      ],
    }

    this.log('\nBuilding a genesis block...')
    const { block } = await makeGenesisBlock(
      node.chain,
      info,
      account,
      node.workerPool,
      this.logger,
    )

    this.log(`\nGenesis Block`)
    const serialized = node.strategy.blockSerde.serialize(block)
    this.log(IJSON.stringify(serialized, '  '))
  }
}
