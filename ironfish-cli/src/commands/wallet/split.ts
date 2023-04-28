/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  Assert,
  CreateTransactionRequest,
  CurrencyUtils,
  RawTransaction,
  RawTransactionSerde,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { IronFlag, LocalFlags } from '../../flags'
import { selectAsset } from '../../utils'
import { parseAllocationsFile } from '../../utils/allocations'
import { selectFee } from '../../utils/fees'
import { watchTransaction } from '../../utils/transaction'

export default class Split extends IronfishCommand {
  static aliases = ['wallet:split']
  static hidden = true

  static flags = {
    ...LocalFlags,
    allocations: Flags.string({
      required: true,
      description:
        'A CSV file with the format publicAddress,amountInOre,memo containing airdrop allocations',
    }),
    account: Flags.string({
      required: false,
      description: 'The name of the account to use for creating split notes',
    }),
    output: Flags.string({
      required: false,
      default: 'split_transaction.txt',
      description: 'A serialized raw transaction for splitting originating note',
    }),
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      largerThan: 0n,
      flagName: 'fee',
    }),
    feeRate: IronFlag({
      char: 'r',
      description: 'The fee rate amount in IRON/Kilobyte',
      largerThan: 0n,
      flagName: 'fee rate',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
    }),
    expiration: Flags.integer({
      char: 'e',
      description:
        'The block sequence after which the transaction will be removed from the mempool. Set to 0 for no expiration.',
    }),
    confirmations: Flags.integer({
      char: 'c',
      description:
        'Minimum number of block confirmations needed to include a note. Set to 0 to include all blocks.',
      required: false,
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'The identifier for the asset to use when sending',
    }),
    rawTransaction: Flags.boolean({
      default: false,
      description:
        'Return raw transaction. Use it to create a transaction but not post to the network',
    }),
    offline: Flags.boolean({
      default: false,
      description: 'Allow offline transaction creation',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Split)
    let account = flags.account
    let assetId = flags.assetId
    let from = flags.account?.trim()
    const client = await this.sdk.connectRpc()

    if (!account) {
      const response = await client.wallet.getDefaultAccount()

      if (response.content.account) {
        account = response.content.account.name
      }
    }
    Assert.isNotUndefined(account)

    const csv = await fs.readFile(flags.allocations, 'utf-8')
    const result = parseAllocationsFile(csv)
    if (!result.ok) {
      throw new Error(result.error)
    }

    if (!flags.offline) {
      const status = await client.node.getStatus()

      if (!status.content.blockchain.synced) {
        this.error(
          `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
        )
      }
    }

    if (assetId == null) {
      const asset = await selectAsset(client, from, {
        action: 'send',
        showNativeAsset: true,
        showNonOwnerAsset: true,
        showSingleAssetChoice: false,
        confirmations: flags.confirmations,
      })

      assetId = asset?.id

      if (!assetId) {
        assetId = Asset.nativeId().toString('hex')
      }
    }

    if (!from) {
      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error(
          `No account is currently active.
           Use ironfish wallet:create <name> to first create an account`,
        )
      }

      from = response.content.account.name
    }

    if (flags.expiration !== undefined && flags.expiration < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }

    const outputs = []
    let amount = 0n
    for (const allocation of result.allocations) {
      amount += allocation.amountInOre
      outputs.push({
        publicAddress: allocation.publicAddress,
        amount: allocation.amountInOre.toString(),
        memo: allocation.memo,
      })
    }

    const params: CreateTransactionRequest = {
      account,
      outputs,
      fee: flags.fee ? CurrencyUtils.encode(flags.fee) : null,
      feeRate: flags.feeRate ? CurrencyUtils.encode(flags.feeRate) : null,
      expiration: flags.expiration,
      confirmations: flags.confirmations,
    }

    let raw: RawTransaction
    if (params.fee === null && params.feeRate === null) {
      raw = await selectFee({
        client,
        transaction: params,
        logger: this.logger,
      })
    } else {
      const response = await client.wallet.createTransaction(params)
      const bytes = Buffer.from(response.content.transaction, 'hex')
      raw = RawTransactionSerde.deserialize(bytes)
    }

    if (flags.rawTransaction) {
      this.log('Raw Transaction')
      this.log(RawTransactionSerde.serialize(raw).toString('hex'))
      this.log(`Run "ironfish wallet:post" to post the raw transaction. `)
      this.exit(0)
    }

    if (!flags.confirm && !(await this.confirm(assetId, amount, raw.fee))) {
      this.error('Transaction aborted.')
    }

    CliUx.ux.action.start('Sending the transaction')

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account: from,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    CliUx.ux.action.stop()

    this.log(`Sent ${CurrencyUtils.renderIron(amount, true, assetId)}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}`)
    this.log(
      `\nIf the transaction is mined, it will appear here https://explorer.ironfish.network/transaction/${transaction
        .hash()
        .toString('hex')}`,
    )

    if (flags.watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account: from,
        hash: transaction.hash().toString('hex'),
      })
    }
  }

  async confirm(assetId: string, amount: bigint, fee: bigint): Promise<boolean> {
    this.log(
      `You are about to send a transaction: ${CurrencyUtils.renderIron(
        amount,
        true,
        assetId,
      )} plus a transaction fee of ${CurrencyUtils.renderIron(fee, true)}`,
    )

    return await CliUx.ux.confirm('Do you confirm (Y/N)?')
  }
}
