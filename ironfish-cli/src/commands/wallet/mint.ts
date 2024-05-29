/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  BufferUtils,
  CreateTransactionRequest,
  CurrencyUtils,
  isValidPublicAddress,
  RawTransaction,
  RawTransactionSerde,
  RPC_ERROR_CODES,
  RpcAsset,
  RpcRequestError,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { IronFlag, RemoteFlags, ValueFlag } from '../../flags'
import { confirmOperation } from '../../utils'
import { selectAsset } from '../../utils/asset'
import { promptCurrency } from '../../utils/currency'
import { promptExpiration } from '../../utils/expiration'
import { getExplorer } from '../../utils/explorer'
import { selectFee } from '../../utils/fees'
import { watchTransaction } from '../../utils/transaction'

export class Mint extends IronfishCommand {
  static description = 'Mint tokens and increase supply for a given asset'

  static examples = [
    '$ ironfish wallet:mint --metadata "see more here" --name mycoin --amount 1000',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount --fee 0.00000001',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --transferOwnershipTo 0000000000000000000000000000000000000000000000000000000000000000',
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
    feeRate: IronFlag({
      char: 'r',
      description: 'The fee rate amount in IRON/Kilobyte',
      minimum: 1n,
      flagName: 'fee rate',
    }),
    amount: ValueFlag({
      char: 'a',
      description: 'Amount of coins to mint in the major denomination',
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
    transferOwnershipTo: Flags.string({
      description: 'The public address of the account to transfer ownership of this asset to.',
      required: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Mint)
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

    const publicKeyResponse = await client.wallet.getAccountPublicKey({ account })
    const accountPublicKey = publicKeyResponse.content.publicKey

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

      const newAsset = new Asset(accountPublicKey, name, metadata)
      assetId = newAsset.id().toString('hex')
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

    let assetData
    if (assetId) {
      try {
        const assetRequest = await client.chain.getAsset({ id: assetId })
        assetData = assetRequest.content
        if (assetData.owner !== accountPublicKey) {
          this.error(`The account '${account}' does not own this asset.`)
        }
      } catch (e) {
        if (e instanceof RpcRequestError && e.code === RPC_ERROR_CODES.NOT_FOUND.valueOf()) {
          // Do nothing, not finding an asset is acceptable since we're likely
          // to be minting one for the first time
        } else {
          throw e
        }
      }
    }

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
        text: 'Enter the amount',
        minimum: 0n,
        logger: this.logger,
        assetId: assetId,
        assetVerification: assetData?.verification,
      })
    }

    if (flags.transferOwnershipTo) {
      if (!isValidPublicAddress(flags.transferOwnershipTo)) {
        this.error('transferOwnershipTo must be a valid public address')
      }
    }

    let expiration = flags.expiration
    if (flags.rawTransaction && expiration === undefined) {
      expiration = await promptExpiration({ logger: this.logger, client: client })
    }

    if (expiration !== undefined && expiration < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }

    const params: CreateTransactionRequest = {
      account,
      outputs: [],
      mints: [
        {
          // Only provide the asset id if we are not minting an asset for the first time
          ...(assetData != null ? { assetId } : {}),
          name,
          metadata,
          value: CurrencyUtils.encode(amount),
          transferOwnershipTo: flags.transferOwnershipTo,
        },
      ],
      fee: flags.fee ? CurrencyUtils.encode(flags.fee) : null,
      feeRate: flags.feeRate ? CurrencyUtils.encode(flags.feeRate) : null,
      expiration: expiration,
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

    await this.confirm(
      account,
      amount,
      raw.fee,
      assetId,
      name,
      metadata,
      flags.transferOwnershipTo,
      flags.confirm,
      assetData,
    )

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

    const renderedValue = CurrencyUtils.render(
      minted.value,
      true,
      minted.asset.id().toString('hex'),
      assetData?.verification,
    )
    const renderedFee = CurrencyUtils.render(transaction.fee(), true)
    this.log(`Minted asset ${BufferUtils.toHuman(minted.asset.name())} from ${account}`)
    this.log(`Asset Identifier: ${minted.asset.id().toString('hex')}`)
    this.log(`Value: ${renderedValue}`)
    this.log(`Fee: ${renderedFee}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)

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
    account: string,
    amount: bigint,
    fee: bigint,
    assetId?: string,
    name?: string,
    metadata?: string,
    transferOwnershipTo?: string,
    confirm?: boolean,
    assetData?: RpcAsset,
  ): Promise<void> {
    const nameString = name ? `\nName: ${name}` : ''
    const metadataString = metadata ? `\nMetadata: ${metadata}` : ''

    const renderedAmount = CurrencyUtils.render(
      amount,
      !!assetId,
      assetId,
      assetData?.verification,
    )
    const renderedFee = CurrencyUtils.render(fee, true)

    const confirmMessage = [
      `You are about to mint an asset with the account ${account}:${nameString}${metadataString}`,
      `Amount: ${renderedAmount}`,
      `Fee: ${renderedFee}`,
    ]

    if (transferOwnershipTo) {
      confirmMessage.push(
        `Ownership of this asset will be transferred to ${transferOwnershipTo}. The current account will no longer have any permission to mint or modify this asset. This cannot be undone.`,
      )
    }

    confirmMessage.push('Do you confirm (Y/N)?')

    await confirmOperation({
      confirmMessage: confirmMessage.join('\n'),
      cancelledMessage: 'Mint aborted.',
      confirm,
    })
  }
}
