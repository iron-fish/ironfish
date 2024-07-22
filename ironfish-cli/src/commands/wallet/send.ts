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
  RpcClient,
  TimeUtils,
  Transaction,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { HexFlag, IronFlag, RemoteFlags, ValueFlag } from '../../flags'
import * as ui from '../../ui'
import { selectAsset } from '../../utils/asset'
import { promptCurrency } from '../../utils/currency'
import { promptExpiration } from '../../utils/expiration'
import { getExplorer } from '../../utils/explorer'
import { selectFee } from '../../utils/fees'
import { Ledger } from '../../utils/ledger'
import { getSpendPostTimeInMs, updateSpendPostTimeInMs } from '../../utils/spendPostTime'
import {
  displayTransactionSummary,
  TransactionTimer,
  watchTransaction,
} from '../../utils/transaction'

export class Send extends IronfishCommand {
  static description = `Send coins to another account`

  static examples = [
    '$ ironfish wallet:send --amount 2.003 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed',
    '$ ironfish wallet:send --amount 2.003 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed --account otheraccount',
    '$ ironfish wallet:send --amount 2.003 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed --account otheraccount --memo "enjoy!"',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to send money from',
    }),
    amount: ValueFlag({
      char: 'a',
      description: 'The amount to send in the major denomination',
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
    assetId: HexFlag({
      char: 'i',
      description: 'The identifier for the asset to use when sending',
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
    offline: Flags.boolean({
      default: false,
      description: 'Allow offline transaction creation',
    }),
    note: Flags.string({
      char: 'n',
      description: 'The note hashes to include in the transaction',
      multiple: true,
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Send a transaction using a Ledger device',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Send)
    let assetId = flags.assetId
    let to = flags.to
    let from = flags.account

    const client = await this.sdk.connectRpc()

    if (!flags.offline) {
      const status = await client.wallet.getNodeStatus()

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

    const assetData = (
      await client.wallet.getAsset({
        account: from,
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

    if (amount == null) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount in the major denomination',
        minimum: 1n,
        logger: this.logger,
        assetId: assetId,
        assetVerification: assetData.verification,
        balance: {
          account: from,
          confirmations: flags.confirmations,
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
      to = await ui.inputPrompt('Enter the public address of the recipient', true)
    }

    const memo = flags.memo ?? (await ui.inputPrompt('Enter the memo (or leave blank)'))

    if (!isValidPublicAddress(to)) {
      this.log(`A valid public address is required`)
      this.exit(1)
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
      expiration: expiration,
      confirmations: flags.confirmations,
      notes: flags.note,
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

    displayTransactionSummary(raw, assetData, amount, from, to, memo)

    if (flags.rawTransaction) {
      this.log('Raw Transaction')
      this.log(RawTransactionSerde.serialize(raw).toString('hex'))
      this.log(`Run "ironfish wallet:post" to post the raw transaction. `)
      this.exit(0)
    }

    if (flags.unsignedTransaction) {
      const response = await client.wallet.buildTransaction({
        account: from,
        rawTransaction: RawTransactionSerde.serialize(raw).toString('hex'),
      })
      this.log('Unsigned Transaction')
      this.log(response.content.unsignedTransaction)
      this.exit(0)
    }

    if (flags.ledger) {
      await this.sendTransactionWithLedger(client, raw, from, flags.watch, flags.confirm)
      this.exit(0)
    }

    const spendPostTime = getSpendPostTimeInMs(this.sdk)

    const transactionTimer = new TransactionTimer(spendPostTime, raw)

    if (spendPostTime > 0) {
      this.log(
        `Time to send: ${TimeUtils.renderSpan(transactionTimer.getEstimateInMs(), {
          hideMilliseconds: true,
        })}`,
      )
    }

    await ui.confirmOrQuit('', flags.confirm)

    transactionTimer.start()

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account: from,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    transactionTimer.end()

    this.log(
      `Sending took ${TimeUtils.renderSpan(
        transactionTimer.getEndTime() - transactionTimer.getStartTime(),
        {
          hideMilliseconds: true,
        },
      )}`,
    )

    await updateSpendPostTimeInMs(
      this.sdk,
      raw,
      transactionTimer.getStartTime(),
      transactionTimer.getEndTime(),
    )

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    const renderedAmount = CurrencyUtils.render(
      amount,
      true,
      assetData.id,
      assetData.verification,
    )
    const renderedFee = CurrencyUtils.render(transaction.fee(), true)
    this.log(`Sent ${renderedAmount} to ${to} from ${from}`)
    this.log(
      ui.card({
        Hash: transaction.hash().toString('hex'),
        Fee: renderedFee,
        Memo: memo,
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
        account: from,
        hash: transaction.hash().toString('hex'),
      })
    }
  }

  private async sendTransactionWithLedger(
    client: RpcClient,
    raw: RawTransaction,
    from: string | undefined,
    watch: boolean,
    confirm: boolean,
  ): Promise<void> {
    const ledger = new Ledger(this.logger)
    try {
      await ledger.connect()
    } catch (e) {
      if (e instanceof Error) {
        this.error(e.message)
      } else {
        throw e
      }
    }

    const publicKey = (await client.wallet.getAccountPublicKey({ account: from })).content
      .publicKey

    const ledgerPublicKey = await ledger.getPublicAddress()

    if (publicKey !== ledgerPublicKey) {
      this.error(
        `The public key on the ledger device does not match the public key of the account '${from}'`,
      )
    }

    const buildTransactionResponse = await client.wallet.buildTransaction({
      account: from,
      rawTransaction: RawTransactionSerde.serialize(raw).toString('hex'),
    })

    const unsignedTransaction = buildTransactionResponse.content.unsignedTransaction

    const signature = (await ledger.sign(unsignedTransaction)).toString('hex')

    this.log(`\nSignature: ${signature}`)

    const addSignatureResponse = await client.wallet.addSignature({
      unsignedTransaction,
      signature,
    })

    const signedTransaction = addSignatureResponse.content.transaction
    const bytes = Buffer.from(signedTransaction, 'hex')

    const transaction = new Transaction(bytes)

    this.log(`\nSigned Transaction: ${signedTransaction}`)
    this.log(`\nHash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.render(transaction.fee(), true)}`)

    await ui.confirmOrQuit('', confirm)

    const addTransactionResponse = await client.wallet.addTransaction({
      transaction: signedTransaction,
      broadcast: true,
    })

    if (addTransactionResponse.content.accepted === false) {
      this.error(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account: from,
        hash: transaction.hash().toString('hex'),
      })
    }
  }
}
