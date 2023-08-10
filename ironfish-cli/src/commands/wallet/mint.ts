/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BufferUtils,
  CreateTransactionRequest,
  CurrencyUtils,
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

export class Mint extends IronfishCommand {
  static description = 'Mint tokens and increase supply for a given asset'

  static examples = [
    '$ ironfish wallet:mint --metadata "see more here" --name mycoin --amount 1000',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount --fee 0.00000001',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to mint from',
    }),
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      minimum: 1n,
      flagName: 'fee',
    }),
    amount: IronFlag({
      char: 'a',
      description: 'Amount of coins to mint in IRON',
      flagName: 'amount',
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'Identifier for the asset',
      required: false,
    }),
    metadata: Flags.string({
      char: 'm',
      description: 'Metadata for the asset',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name for the asset',
      required: false,
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
        'Return the raw transaction. Used to create a transaction but not post to the network',
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
    const { flags } = await this.parse(Mint)
    const client = await this.sdk.connectWalletRpc({ connectNodeClient: true })

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

    if (flags.expiration !== undefined && flags.expiration < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }

    let assetId = flags.assetId
    let metadata = flags.metadata
    let name = flags.name

    // We can assume the prompt can be skipped if at least one of metadata or
    // name is provided
    let isMintingNewAsset = Boolean(name || metadata)
    if (!assetId && !metadata && !name) {
      isMintingNewAsset = await CliUx.ux.confirm('Do you want to create a new asset (Y/N)?')
    }

    if (isMintingNewAsset) {
      if (!name) {
        name = await CliUx.ux.prompt('Enter the name for the new asset', {
          required: true,
        })
      }

      if (!metadata) {
        metadata = await CliUx.ux.prompt('Enter metadata for the new asset', {
          default: '',
          required: false,
        })
      }
    } else if (!assetId) {
      const asset = await selectAsset(client, account, {
        action: 'mint',
        showNativeAsset: false,
        showNonCreatorAsset: false,
        showSingleAssetChoice: true,
        confirmations: flags.confirmations,
      })

      if (!asset) {
        this.error(`You must have an existing asset. Try creating a new one.`)
      }

      assetId = asset.id
    }

    let amount = flags.amount
    if (!amount) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount',
        minimum: 1n,
        logger: this.logger,
      })
    }

    const params: CreateTransactionRequest = {
      account,
      outputs: [],
      mints: [
        {
          assetId,
          name,
          metadata,
          value: CurrencyUtils.encode(amount),
        },
      ],
      fee: flags.fee ? CurrencyUtils.encode(flags.fee) : null,
      expiration: flags.expiration,
      confirmations: flags.confirmations,
    }

    let raw: RawTransaction

    if (params.fee === null) {
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

    if (
      !flags.confirm &&
      !(await this.confirm(account, amount, raw.fee, assetId, name, metadata))
    ) {
      this.error('Transaction aborted.')
    }

    CliUx.ux.action.start('Sending the transaction')

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    CliUx.ux.action.stop()

    const minted = transaction.mints[0]

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    this.log(`Minted asset ${BufferUtils.toHuman(minted.asset.name())} from ${account}`)
    this.log(`Asset Identifier: ${minted.asset.id().toString('hex')}`)
    this.log(
      `Value: ${CurrencyUtils.renderIron(
        minted.value,
        true,
        minted.asset.id().toString('hex'),
      )}`,
    )
    this.log(`Fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
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
        account,
        hash: transaction.hash().toString('hex'),
      })
    }
  }

  async confirm(
    account: string,
    amount: bigint,
    fee: bigint,
    assetId?: string,
    name?: string,
    metadata?: string,
  ): Promise<boolean> {
    const nameString = name ? `\nName: ${name}` : ''
    const metadataString = metadata ? `\nMetadata: ${metadata}` : ''
    this.log(
      `You are about to mint an asset with the account ${account}:${nameString}${metadataString}`,
    )
    this.log(`Amount: ${CurrencyUtils.renderIron(amount, !!assetId, assetId)}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(fee, true)}`)

    return CliUx.ux.confirm('Do you confirm (Y/N)?')
  }
}
