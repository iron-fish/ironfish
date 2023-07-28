/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  CreateTransactionRequest,
  CurrencyUtils,
  isValidPublicAddress,
  RawTransaction,
  RawTransactionSerde,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { IronFlag, RemoteFlags } from '../../flags'
import { selectAsset } from '../../utils/asset'
import { promptCurrency } from '../../utils/currency'
import { selectFee } from '../../utils/fees'
import { watchTransaction } from '../../utils/transaction'

export class Send extends IronfishCommand {
  static description = `Send coins to another account`

  static examples = [
    '$ ironfish wallet:send --amount 2 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed',
    '$ ironfish wallet:send --amount 2 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed --account otheraccount',
    '$ ironfish wallet:send --amount 2 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed --account otheraccount --memo "enjoy!"',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to send money from',
    }),
    amount: IronFlag({
      char: 'a',
      description: 'Amount of coins to send',
      flagName: 'amount',
    }),
    to: Flags.string({
      char: 't',
      description: 'The public address of the recipient',
    }),
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      minimum: 1n,
      flagName: 'fee',
    }),
    feeRate: IronFlag({
      char: 'r',
      description: 'The fee rate amount in IRON/Kilobyte',
      minimum: 1n,
      flagName: 'fee rate',
    }),
    memo: Flags.string({
      char: 'm',
      description: 'The memo of transaction',
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
    const { flags } = await this.parse(Send)
    let amount = flags.amount
    let assetId = flags.assetId
    let to = flags.to?.trim()
    let from = flags.account?.trim()

    const client = await this.sdk.connectRpc()

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
        showNonCreatorAsset: true,
        showSingleAssetChoice: false,
        confirmations: flags.confirmations,
      })

      assetId = asset?.id

      if (!assetId) {
        assetId = Asset.nativeId().toString('hex')
      }
    }

    if (amount == null) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount',
        minimum: 1n,
        logger: this.logger,
        balance: {
          account: from,
          confirmations: flags.confirmations,
          assetId,
        },
      })
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

    if (!to) {
      to = await CliUx.ux.prompt('Enter the public address of the recipient', {
        required: true,
      })
    }

    const memo =
      flags.memo?.trim() ??
      (await CliUx.ux.prompt('Enter the memo (or leave blank)', { required: false }))

    if (!isValidPublicAddress(to)) {
      this.log(`A valid public address is required`)
      this.exit(1)
    }

    if (flags.expiration !== undefined && flags.expiration < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }

    const params: CreateTransactionRequest = {
      account: from,
      outputs: [
        {
          publicAddress: to,
          amount: CurrencyUtils.encode(amount),
          memo,
          assetId,
        },
      ],
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
        account: from,
        confirmations: flags.confirmations,
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

    if (!flags.confirm && !(await this.confirm(assetId, amount, raw.fee, from, to, memo))) {
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

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    this.log(`Sent ${CurrencyUtils.renderIron(amount, true, assetId)} to ${to} from ${from}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}`)
    this.log(`Memo: ${memo}`)
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

  async confirm(
    assetId: string,
    amount: bigint,
    fee: bigint,
    from: string,
    to: string,
    memo: string,
  ): Promise<boolean> {
    this.log(
      `You are about to send a transaction: ${CurrencyUtils.renderIron(
        amount,
        true,
        assetId,
      )} plus a transaction fee of ${CurrencyUtils.renderIron(
        fee,
        true,
      )} to ${to} from the account "${from}" with the memo "${memo}"`,
    )

    return await CliUx.ux.confirm('Do you confirm (Y/N)?')
  }
}
