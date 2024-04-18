/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BufferUtils,
  CreateTransactionRequest,
  CurrencyUtils,
  RawTransaction,
  RawTransactionSerde,
  RpcAsset,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { IronFlag, RemoteFlags, ValueFlag } from '../../flags'
import { confirmOperation } from '../../utils'
import { selectAsset } from '../../utils/asset'
import { promptCurrency } from '../../utils/currency'
import { getExplorer } from '../../utils/explorer'
import { selectFee } from '../../utils/fees'
import { watchTransaction } from '../../utils/transaction'

export class Burn extends IronfishCommand {
  static description = 'Burn tokens and decrease supply for a given asset'

  static examples = [
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000',
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount',
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount --fee 0.00000001',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to burn from',
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
    amount: ValueFlag({
      char: 'a',
      description: 'Amount of coins to burn in the major denomination',
      flagName: 'amount',
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'Identifier for the asset',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    confirmations: Flags.integer({
      char: 'c',
      description:
        'Minimum number of block confirmations needed to include a note. Set to 0 to include all blocks.',
      required: false,
    }),
    rawTransaction: Flags.boolean({
      default: false,
      description:
        'Return raw transaction. Use it to create a transaction but not post to the network',
    }),
    expiration: Flags.integer({
      char: 'e',
      description:
        'The block sequence that the transaction can not be mined after. Set to 0 for no expiration.',
    }),
    offline: Flags.boolean({
      default: false,
      description: 'Allow offline transaction creation',
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Burn)
    const client = await this.sdk.connectRpc()

    if (!flags.offline) {
      const status = await client.wallet.getNodeStatus()
      if (!status.content.blockchain.synced) {
        this.log(
          `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
        )
        this.exit(1)
      }
    }

    let account = flags.account
    if (!account) {
      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error(
          `No account is currently active.
           Use ironfish wallet:create <name> to first create an account`,
        )
      }

      account = response.content.account.name
    }

    let assetId = flags.assetId

    if (assetId == null) {
      const asset = await selectAsset(client, account, {
        action: 'burn',
        showNativeAsset: false,
        showNonCreatorAsset: true,
        showSingleAssetChoice: true,
        confirmations: flags.confirmations,
      })

      assetId = asset?.id
    }

    if (assetId == null) {
      this.error(`You must have a custom asset in order to burn.`)
    }

    const assetData = (
      await client.wallet.getAsset({
        account,
        id: assetId,
        confirmations: flags.confirmations,
      })
    ).content

    let amount
    if (flags.amount) {
      const [parsedAmount, error] = CurrencyUtils.tryMajorToMinor(
        flags.amount,
        assetId,
        assetData?.verification,
      )

      if (error) {
        this.error(`${error.reason}`)
      }

      amount = parsedAmount
    }

    if (!amount) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount of the custom asset to burn',
        minimum: 1n,
        logger: this.logger,
        assetId: assetId,
        assetVerification: assetData.verification,
        balance: {
          account,
          confirmations: flags.confirmations,
        },
      })
    }

    const params: CreateTransactionRequest = {
      account,
      outputs: [],
      burns: [
        {
          assetId,
          value: CurrencyUtils.encode(amount),
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
        account: account,
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

    await this.confirm(assetData, amount, raw.fee, account, flags.confirm)

    CliUx.ux.action.start('Sending the transaction')

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account,
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

    const assetName = BufferUtils.toHuman(Buffer.from(assetData.name, 'hex'))
    const renderedAmount = CurrencyUtils.render(
      amount,
      false,
      assetData.id,
      assetData.verification,
    )

    this.log(`Burned asset ${assetName} from ${account}`)
    this.log(`Asset Identifier: ${assetId}`)
    this.log(`Amount: ${renderedAmount}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.render(transaction.fee(), true)}`)

    const networkId = (await client.chain.getNetworkInfo()).content.networkId
    const transactionUrl = getExplorer(networkId)?.getTransactionUrl(
      transaction.hash().toString('hex'),
    )

    if (transactionUrl) {
      this.log(`\nIf the transaction is mined, it will appear here: ${transactionUrl}`)
    }

    if (flags.watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account,
        hash: transaction.hash().toString('hex'),
      })
    }
  }

  async confirm(
    asset: RpcAsset,
    amount: bigint,
    fee: bigint,
    account: string,
    confirm?: boolean,
  ): Promise<void> {
    const renderedAmount = CurrencyUtils.render(amount, true, asset.id, asset.verification)
    const renderedFee = CurrencyUtils.render(fee, true)

    await confirmOperation({
      confirm,
      confirmMessage: `You are about to burn: ${renderedAmount} plus a transaction fee of ${renderedFee} with the account ${account}\nDo you confirm(Y/N)?`,
      cancelledMessage: 'Burn aborted.',
    })
  }
}
