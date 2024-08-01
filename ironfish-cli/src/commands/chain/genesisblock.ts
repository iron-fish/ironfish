/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MEMO_LENGTH } from '@ironfish/rust-nodejs'
import {
  BlockSerde,
  CurrencyUtils,
  GenesisBlockAllocation,
  GenesisBlockInfo,
  IJSON,
  isValidPublicAddress,
  makeGenesisBlock,
  Target,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { confirmOrQuit, table, TableColumns } from '../../ui'

export default class GenesisBlockCommand extends IronfishCommand {
  static description = 'Create and serialize a genesis block'

  static hidden = true

  static flags = {
    account: Flags.string({
      char: 'a',
      required: false,
      default: 'IronFishGenesisAccount',
      description: 'The name of the account to use for keys to assign the genesis block to',
    }),
    difficulty: Flags.string({
      default: (Target.minDifficulty() * 100n).toString(),
      description: 'The initial difficulty to start the chain with',
    }),
    memo: Flags.string({
      char: 'm',
      required: false,
      default: 'Genesis Block',
      description: 'The memo of the block',
    }),
    allocations: Flags.string({
      required: false,
      description:
        'A CSV file with the format address,amountInIron,memo containing genesis block allocations',
      exclusive: ['account', 'memo'],
    }),
    genesisSupplyInIron: Flags.string({
      char: 'g',
      required: true,
      default: '42000000',
      description: 'The amount of coins in the genesis block',
    }),
    dry: Flags.boolean({
      default: false,
      description: 'Display genesis block allocations without creating the genesis block',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(GenesisBlockCommand)

    let target
    try {
      target = Target.fromDifficulty(BigInt(flags.difficulty))
    } catch {
      this.error(`Invalid value for difficulty: ${flags.difficulty}`, { exit: 1 })
    }

    const node = await this.sdk.node({ autoSeed: false })
    await node.openDB()

    if (!node.chain.isEmpty) {
      this.log(
        `The database ${node.config.chainDatabasePath} must be empty to create a genesis block.`,
      )
      this.exit(0)
    }

    const expectedSupply = CurrencyUtils.decodeIron(flags.genesisSupplyInIron)
    let allocations: GenesisBlockAllocation[]
    if (flags.allocations) {
      // If the allocations flag is set, read allocations from a CSV file
      const csv = await fs.readFile(flags.allocations, 'utf-8')
      const result = parseAllocationsFile(csv)

      if (!result.ok) {
        this.error(result.error)
      }

      const totalSupply: bigint = result.allocations.reduce((prev, cur) => {
        return prev + cur.amountInOre
      }, 0n)

      if (totalSupply !== expectedSupply) {
        this.error(
          `Allocations file contains ${CurrencyUtils.encodeIron(
            totalSupply,
          )} $IRON, but --genesisSupplyInIron expects ${flags.genesisSupplyInIron} $IRON.`,
        )
      }

      allocations = result.allocations
    } else {
      // If the allocations flag is not set, create a genesis block with supply belonging to --flags.account
      let account = null
      if (flags.account !== null) {
        account = node.wallet.getAccountByName(flags.account)
      }

      if (account === null) {
        const name = `IronFishGenesisAccount` // Faucet depends on the name
        account = await node.wallet.createAccount(name)
        this.log(`Creating account ${account.name} to assign the genesis block to.`)
      }

      allocations = [
        {
          publicAddress: account.publicAddress,
          amountInOre: expectedSupply,
          memo: flags.memo,
        },
      ]
    }

    const info: GenesisBlockInfo = {
      timestamp: Date.now(),
      target,
      allocations,
    }

    // Log genesis block info
    this.log(`Genesis block will be created with the following values:`)
    this.log(`\nDifficulty: ${target.toDifficulty()}\n`)
    this.log(`Allocations:`)
    const columns: TableColumns<GenesisBlockAllocation> = {
      identity: {
        header: 'ADDRESS',
        get: (row: GenesisBlockAllocation) => row.publicAddress,
      },
      amount: {
        header: 'AMOUNT ($IRON)',
        get: (row: GenesisBlockAllocation) => {
          return CurrencyUtils.encodeIron(row.amountInOre)
        },
      },
      memo: {
        header: 'MEMO',
        get: (row: GenesisBlockAllocation) => row.memo,
      },
    }

    table(info.allocations, columns, {
      printLine: this.log.bind(this),
    })

    // Display duplicates if they exist
    const duplicates = getDuplicates(allocations)
    if (duplicates.length > 0) {
      this.log(
        `\n/!\\ Allocations contains the following duplicate addresses. This will not cause errors, but may be a mistake. /!\\`,
      )
      for (const duplicate of duplicates) {
        this.log(duplicate)
      }
      this.log('\n')
    }

    // Exit if dry run, otherwise confirm
    if (flags.dry) {
      this.exit(0)
    } else {
      await confirmOrQuit('Create the genesis block?')
    }

    this.log('\nBuilding a genesis block...')
    const { block } = await makeGenesisBlock(node.chain, info, this.logger)

    this.log(`\nGenesis Block`)
    const serialized = BlockSerde.serialize(block)
    this.log(IJSON.stringify(serialized, '  '))
  }
}

const getDuplicates = (allocations: readonly GenesisBlockAllocation[]): string[] => {
  const duplicateSet = new Set<string>()
  const nonDuplicateSet = new Set()

  for (const alloc of allocations) {
    if (nonDuplicateSet.has(alloc.publicAddress)) {
      duplicateSet.add(alloc.publicAddress)
    } else {
      nonDuplicateSet.add(alloc.publicAddress)
    }
  }

  return [...duplicateSet]
}

const parseAllocationsFile = (
  fileContent: string,
): { ok: true; allocations: GenesisBlockAllocation[] } | { ok: false; error: string } => {
  const allocations: GenesisBlockAllocation[] = []

  let lineNum = 0
  for (const line of fileContent.split(/[\r\n]+/)) {
    lineNum++
    if (line.trim().length === 0) {
      continue
    }

    const [address, amountInIron, memo, ...rest] = line.split(',').map((v) => v.trim())

    if (rest.length > 0) {
      return {
        ok: false,
        error: `Line ${lineNum}: (${line}) contains more than 3 values.`,
      }
    }

    // Check address length
    if (!isValidPublicAddress(address)) {
      return {
        ok: false,
        error: `Line ${lineNum}: (${line}) has an invalid public address.`,
      }
    }

    // Check amount is positive and decodes as $IRON
    const amountInOre = CurrencyUtils.decodeIron(amountInIron)
    if (amountInOre < 0) {
      return {
        ok: false,
        error: `Line ${lineNum}: (${line}) contains a negative $IRON amount.`,
      }
    }

    // Check memo length
    if (Buffer.from(memo).byteLength > MEMO_LENGTH) {
      return {
        ok: false,
        error: `Line ${lineNum}: (${line}) contains a memo with byte length > ${MEMO_LENGTH}.`,
      }
    }

    allocations.push({
      publicAddress: address,
      amountInOre: amountInOre,
      memo: memo,
    })
  }

  return { ok: true, allocations }
}
