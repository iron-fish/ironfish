/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  CreateTransactionRequest,
  CurrencyUtils,
  RawTransaction,
  RawTransactionSerde,
  RpcAsset,
  RpcClient,
  TimeUtils,
  Transaction,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../command'
import { HexFlag, IronFlag, RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { getAssetsByIDs } from '../../../utils'
import { getExplorer } from '../../../utils/explorer'
import { selectFee } from '../../../utils/fees'
import { fetchNotes } from '../../../utils/note'
import {
  benchmarkSpendPostTime,
  getSpendPostTimeInMs,
  updateSpendPostTimeInMs,
} from '../../../utils/spendPostTime'
import {
  displayTransactionSummary,
  TransactionTimer,
  watchTransaction,
} from '../../../utils/transaction'

export class CombineNotesCommand extends IronfishCommand {
  static description = `Combine notes into a single note`

  static flags = {
    ...RemoteFlags,
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
    notes: Flags.integer({
      description: 'How many notes to combine',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
    }),
    to: Flags.string({
      char: 't',
      description: 'The public address of the recipient',
    }),
    account: Flags.string({
      char: 'f',
      description: 'Name of the account to send money from',
    }),
    benchmark: Flags.boolean({
      hidden: true,
      default: false,
      description: 'Force run the benchmark to measure the time to combine 1 note',
    }),
    rawTransaction: Flags.boolean({
      default: false,
      description:
        'Return raw transaction. Use it to create a transaction but not post to the network',
    }),
    assetId: HexFlag({
      char: 'i',
      description: 'The identifier for the asset to combine notes for',
    }),
  }

  private async selectNotesToCombine(spendPostTimeMs: number): Promise<number> {
    const spendsPerMinute = Math.max(Math.floor(60000 / spendPostTimeMs), 2) // minimum of 2 notes per minute in case the spentPostTime is very high

    const low = spendsPerMinute
    const medium = spendsPerMinute * 5
    const high = spendsPerMinute * 10

    const choices = [
      {
        name: `~1 minute: ${low} notes`,
        value: low,
      },
      {
        name: `~5 minutes: ${medium} notes`,
        value: medium,
        default: true,
      },
      {
        name: `~10 minutes: ${high} notes`,
        value: high,
      },
      {
        name: 'Enter a custom number of notes',
        value: null,
      },
    ]

    const result = await inquirer.prompt<{
      selection: number
    }>([
      {
        name: 'selection',
        message: `Select the number of notes you wish to combine (MAX): `,
        type: 'list',
        choices,
      },
    ])

    if (result.selection) {
      return result.selection
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await ui.inputPrompt('Enter the number of notes', true)

      const notesToCombine = parseInt(result)

      if (isNaN(notesToCombine)) {
        this.logger.error(`The number of notes must be a number`)
        continue
      }

      if (notesToCombine > high) {
        this.logger.error(`The number of notes cannot be higher than the ${high}`)
        continue
      }

      if (notesToCombine < 2) {
        this.logger.error(`The number must be larger than 1`)
        continue
      }

      return notesToCombine
    }
  }

  private async calculateExpiration(
    client: RpcClient,
    spendPostTimeInMs: number,
    numberOfNotes: number,
  ) {
    const currentBlockSequence = await this.getCurrentBlockSequence(client)

    let timeLastFiveBlocksInMs = 0

    let currentBlockTime = new Date(
      (
        await client.chain.getBlock({
          sequence: currentBlockSequence,
        })
      ).content.block.timestamp,
    )

    for (let i = 0; i < 5; i++) {
      const blockTime = new Date(
        (
          await client.chain.getBlock({
            sequence: currentBlockSequence - i,
          })
        ).content.block.timestamp,
      )

      timeLastFiveBlocksInMs += currentBlockTime.getTime() - blockTime.getTime()

      currentBlockTime = blockTime
    }

    const averageBlockTimeInMs = timeLastFiveBlocksInMs / 5

    const targetBlockTimeInMs =
      (await client.chain.getConsensusParameters()).content.targetBlockTimeInSeconds * 1000

    const blockTimeForCalculation = Math.min(averageBlockTimeInMs, targetBlockTimeInMs)

    let expiration = Math.ceil(
      currentBlockSequence + (spendPostTimeInMs * numberOfNotes * 2) / blockTimeForCalculation, // * 2 added to account for the time it takes to calculate fees
    )

    const config = await client.config.getConfig()

    if (config.content.transactionExpirationDelta) {
      expiration = Math.max(
        currentBlockSequence + config.content.transactionExpirationDelta,
        expiration,
      )
    }

    return expiration
  }

  private async getCurrentBlockSequence(client: RpcClient) {
    const getCurrentBlock = await client.chain.getChainInfo()
    const currentBlockSequence = parseInt(getCurrentBlock.content.currentBlockIdentifier.index)
    return currentBlockSequence
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CombineNotesCommand)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let to = flags.to
    let from = flags.account
    let assetId = flags.assetId

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
      const response = await client.wallet.getAccountPublicKey({
        account: from,
      })

      to = response.content.publicKey
    }

    if (!assetId) {
      const asset = await ui.assetPrompt(client, from, {
        action: 'combine notes for',
        showNativeAsset: true,
        showNonCreatorAsset: true,
        showSingleAssetChoice: false,
      })

      assetId = asset?.id

      if (!assetId) {
        assetId = Asset.nativeId().toString('hex')
      }
    }

    await this.ensureUserHasEnoughNotesToCombine(client, from, assetId)

    let spendPostTime = getSpendPostTimeInMs(this.sdk)

    if (spendPostTime <= 0 || flags.benchmark) {
      spendPostTime = await benchmarkSpendPostTime(this.sdk, client, from)
    }

    let numberOfNotes = flags.notes

    if (numberOfNotes === undefined) {
      numberOfNotes = await this.selectNotesToCombine(spendPostTime)
    }

    let notes = await fetchNotes(client, from, assetId, numberOfNotes)

    // If the user doesn't have enough notes for their selection, we reduce the number of notes so that
    // the largest note can be used for fees.
    if (notes.length < numberOfNotes) {
      numberOfNotes = notes.length - 1
    }

    notes = notes.slice(0, numberOfNotes)

    const totalAmount = notes.reduce((acc, note) => acc + BigInt(note.value), 0n)

    const memo = flags.memo ?? (await ui.inputPrompt('Enter the memo (or leave blank)'))

    const expiration = await this.calculateExpiration(client, spendPostTime, numberOfNotes)

    const params: CreateTransactionRequest = {
      account: from,
      outputs: [
        {
          publicAddress: to,
          assetId,
          amount: CurrencyUtils.encode(totalAmount),
          memo,
        },
      ],
      fee: flags.fee ? CurrencyUtils.encode(flags.fee) : null,
      feeRate: flags.feeRate ? CurrencyUtils.encode(flags.feeRate) : null,
      notes: notes.map((note) => note.noteHash),
      expiration,
    }

    let raw: RawTransaction
    if (params.fee === null && params.feeRate === null) {
      raw = await selectFee({
        client,
        transaction: params,
        account: from,
        logger: this.logger,
      })
    } else {
      const response = await client.wallet.createTransaction(params)
      const bytes = Buffer.from(response.content.transaction, 'hex')
      raw = RawTransactionSerde.deserialize(bytes)
    }

    let amount = totalAmount
    // This allows for a single note output when combining native notes
    if (assetId === Asset.nativeId().toString('hex')) {
      amount = totalAmount - raw.fee
    }
    params.outputs[0].amount = CurrencyUtils.encode(amount)
    params.fee = CurrencyUtils.encode(raw.fee)

    const createTransactionResponse = await client.wallet.createTransaction(params)
    const createTransactionBytes = Buffer.from(
      createTransactionResponse.content.transaction,
      'hex',
    )
    raw = RawTransactionSerde.deserialize(createTransactionBytes)

    // Always fetch native asset details to account for change notes
    const assetIds = [assetId, Asset.nativeId().toString('hex')]
    const assetData = await getAssetsByIDs(client, assetIds, from, undefined)

    displayTransactionSummary(raw, assetData[assetId], amount, from, to, memo)

    if (flags.rawTransaction) {
      this.log('Raw Transaction')
      this.log(createTransactionBytes.toString('hex'))
      this.log(`Run "ironfish wallet:post" to post the raw transaction. `)
      this.exit(0)
    }

    const transactionTimer = new TransactionTimer(spendPostTime, raw)

    this.log(
      `Time to combine: ${TimeUtils.renderSpan(transactionTimer.getEstimateInMs(), {
        hideMilliseconds: true,
      })}`,
    )

    await ui.confirmOrQuit('', flags.confirm)

    transactionTimer.start()

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account: from,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    transactionTimer.end()

    await updateSpendPostTimeInMs(
      this.sdk,
      raw,
      transactionTimer.getStartTime(),
      transactionTimer.getEndTime(),
    )

    this.log(
      `Combining took ${TimeUtils.renderSpan(
        transactionTimer.getEndTime() - transactionTimer.getStartTime(),
        {
          hideMilliseconds: true,
        },
      )}`,
    )

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    await this.displayCombinedNoteHashes(client, from, transaction, assetData)

    this.log(`Transaction hash: ${transaction.hash().toString('hex')}`)

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

  private async ensureUserHasEnoughNotesToCombine(
    client: RpcClient,
    from: string,
    assetId: string,
  ) {
    const notes = await fetchNotes(client, from, assetId, 10)

    if (notes.length < 3) {
      this.log(`Your notes are already combined. You currently have ${notes.length} notes.`)
      this.exit(0)
    }
  }

  private async displayCombinedNoteHashes(
    client: RpcClient,
    from: string,
    transaction: Transaction,
    assetData: { [key: string]: RpcAsset },
  ) {
    const resultingNotes = (
      await client.wallet.getAccountTransaction({
        account: from,
        hash: transaction.hash().toString('hex'),
      })
    ).content.transaction?.notes

    if (resultingNotes) {
      this.log('')
      ui.table(
        resultingNotes,
        {
          hash: {
            header: 'Notes Created',
            get: (note) => note.noteHash,
          },
          value: {
            header: 'Value',
            get: (note) =>
              CurrencyUtils.render(
                note.value,
                true,
                note.assetId,
                assetData[note.assetId].verification,
              ),
          },
          owner: {
            header: 'Owner',
            get: (note) => note.owner,
          },
        },
        { 'no-truncate': true },
      )
      this.log('')
    }
  }
}
