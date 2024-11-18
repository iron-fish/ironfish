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
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { IronFlag, RemoteFlags, ValueFlag } from '../../flags'
import * as ui from '../../ui'
import { useAccount } from '../../utils'
import { promptCurrency } from '../../utils/currency'
import { promptExpiration } from '../../utils/expiration'
import { getExplorer } from '../../utils/explorer'
import { selectFee } from '../../utils/fees'
import { watchTransaction } from '../../utils/transaction'

export class Burn extends IronfishCommand {
  static description = `create a transaction to burn tokens

This will destroy tokens and decrease supply for a given asset.`

  static examples = [
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000',
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount',
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount --fee 0.00000001',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to burn from',
    }),
    fee: IronFlag({
      description: 'The fee amount in IRON',
      minimum: 1n,
      flagName: 'fee',
    }),
    feeRate: IronFlag({
      description: 'The fee rate amount in IRON/Kilobyte',
      minimum: 1n,
      flagName: 'fee rate',
    }),
    amount: ValueFlag({
      description: 'Amount of coins to burn in the major denomination',
      flagName: 'amount',
    }),
    assetId: Flags.string({
      description: 'Identifier for the asset',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    confirmations: Flags.integer({
      description:
        'Minimum number of block confirmations needed to include a note. Set to 0 to include all blocks.',
    }),
    rawTransaction: Flags.boolean({
      default: false,
      description:
        'Return raw transaction. Use it to create a transaction but not post to the network',
    }),
    unsignedTransaction: Flags.boolean({
      default: false,
      description:
        'Return a serialized UnsignedTransaction. Use it to create a transaction and build proofs but not post to the network',
      exclusive: ['rawTransaction'],
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
    ledger: Flags.boolean({
      default: false,
      description: 'Burn a transaction using a Ledger device',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Burn)
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    if (!flags.offline) {
      const status = await client.wallet.getNodeStatus()
      if (!status.content.blockchain.synced) {
        this.log(
          `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
        )
        this.exit(1)
      }
    }

    const account = await useAccount(client, flags.account)

    let assetId = flags.assetId

    if (assetId == null) {
      const asset = await ui.assetPrompt(client, account, {
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
        this.error(`${error.message}`)
      }

      amount = parsedAmount
    }

    if (!amount) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount to burn',
        minimum: 1n,
        logger: this.logger,
        assetData,
        balance: {
          account,
          confirmations: flags.confirmations,
        },
      })
    }

    let expiration = flags.expiration
    if ((flags.rawTransaction || flags.unsignedTransaction) && expiration === undefined) {
      expiration = await promptExpiration({ logger: this.logger, client: client })
    }

    if (expiration !== undefined && expiration < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
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

    if (flags.unsignedTransaction) {
      const response = await client.wallet.buildTransaction({
        account,
        rawTransaction: RawTransactionSerde.serialize(raw).toString('hex'),
      })
      this.log('Unsigned Transaction')
      this.log(response.content.unsignedTransaction)
      this.exit(0)
    }

    await this.confirm(assetData, amount, raw.fee, account, flags.confirm)

    if (flags.ledger) {
      await ui.sendTransactionWithLedger(
        client,
        raw,
        account,
        flags.watch,
        flags.confirm,
        this.logger,
      )
      this.exit(0)
    }

    ux.action.start('Sending the transaction')

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    ux.action.stop()

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
    this.log(
      ui.card({
        'Asset Identifier': assetId,
        Amount: renderedAmount,
        Hash: transaction.hash().toString('hex'),
        Fee: CurrencyUtils.render(transaction.fee(), true),
      }),
    )

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

    await ui.confirmOrQuit(
      `You are about to burn ${renderedAmount} plus a transaction fee of ${renderedFee} with the account ${account}\nDo you confirm?`,
      confirm,
    )
  }
}
