/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MEMO_LENGTH } from '@ironfish/rust-nodejs'
import {
  addGenesisTransaction,
  BlockSerde,
  CurrencyUtils,
  GenesisBlockAllocation,
  IJSON,
  isValidPublicAddress,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { confirmOrQuit, table, TableColumns } from '../../ui'

export default class GenesisAddCommand extends IronfishCommand {
  static hidden = true

  static flags = {
    account: Flags.string({
      char: 'a',
      required: true,
      description: 'The name of the account to reallocate from',
    }),
    allocations: Flags.string({
      required: true,
      description:
        'A CSV file with the format address,amountInIron,memo containing genesis block allocations',
    }),
    totalAmount: Flags.string({
      char: 'g',
      required: true,
      description: 'The total prior allocation to the given account',
    }),
    dry: Flags.boolean({
      default: false,
      description: 'Display genesis block allocations without creating the genesis block',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(GenesisAddCommand)

    const node = await this.sdk.node()
    await node.openDB()

    const account = node.wallet.getAccountByName(flags.account)
    if (account === null) {
      this.log(`Account ${flags.account} does not exist, make sure it is imported first`)
      this.exit(0)
      return
    }

    const totalAmount = CurrencyUtils.decodeIron(flags.totalAmount)
    const csv = await fs.readFile(flags.allocations, 'utf-8')
    const result = parseAllocationsFile(csv)

    if (!result.ok) {
      this.error(result.error)
    }

    const totalSupply: bigint = result.allocations.reduce((prev, cur) => {
      return prev + cur.amountInOre
    }, 0n)

    if (totalSupply !== totalAmount) {
      this.error(
        `Allocations file contains ${CurrencyUtils.encodeIron(
          totalSupply,
        )} $IRON, but --totalAmount expects ${flags.totalAmount} $IRON.`,
      )
    }

    const allocations: GenesisBlockAllocation[] = result.allocations

    // Log genesis block info
    this.log(`Genesis block will be modified with the following values in a new transaction:`)
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

    table(allocations, columns, {
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
      await confirmOrQuit('Create new genesis block?')
    }

    this.log('\nBuilding a genesis block...')
    const { block } = await addGenesisTransaction(node, account, allocations, this.logger)

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
