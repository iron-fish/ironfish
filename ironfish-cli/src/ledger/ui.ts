/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  CurrencyUtils,
  Logger,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  Transaction,
} from '@ironfish/sdk'
import { Errors, ux } from '@oclif/core'
import * as ui from '../ui'
import { watchTransaction } from '../utils/transaction'
import { LedgerSingleSigner } from './ledgerSingleSigner'

export async function sendTransactionWithLedger(
  client: RpcClient,
  raw: RawTransaction,
  from: string | undefined,
  watch: boolean,
  confirm: boolean,
  logger?: Logger,
): Promise<void> {
  const ledger = new LedgerSingleSigner(logger)

  try {
    await ledger.connect()
  } catch (e) {
    if (e instanceof Error) {
      Errors.error(e.message)
    } else {
      throw e
    }
  }

  const publicKey = (await client.wallet.getAccountPublicKey({ account: from })).content
    .publicKey

  const ledgerPublicKey = await ledger.getPublicAddress()

  if (publicKey !== ledgerPublicKey) {
    Errors.error(
      `The public key on the ledger device does not match the public key of the account '${from}'`,
    )
  }

  const buildTransactionResponse = await client.wallet.buildTransaction({
    account: from,
    rawTransaction: RawTransactionSerde.serialize(raw).toString('hex'),
  })

  const unsignedTransaction = buildTransactionResponse.content.unsignedTransaction

  const signature = (await ledger.sign(unsignedTransaction)).toString('hex')

  ux.stdout(`\nSignature: ${signature}`)

  const addSignatureResponse = await client.wallet.addSignature({
    unsignedTransaction,
    signature,
  })

  const signedTransaction = addSignatureResponse.content.transaction
  const bytes = Buffer.from(signedTransaction, 'hex')

  const transaction = new Transaction(bytes)

  ux.stdout(`\nSigned Transaction: ${signedTransaction}`)
  ux.stdout(`\nHash: ${transaction.hash().toString('hex')}`)
  ux.stdout(`Fee: ${CurrencyUtils.render(transaction.fee(), true)}`)

  await ui.confirmOrQuit('Would you like to broadcast this transaction?', confirm)

  const addTransactionResponse = await client.wallet.addTransaction({
    transaction: signedTransaction,
    broadcast: true,
  })

  if (addTransactionResponse.content.accepted === false) {
    Errors.error(
      `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
    )
  }

  if (watch) {
    ux.stdout('')

    await watchTransaction({
      client,
      logger,
      account: from,
      hash: transaction.hash().toString('hex'),
    })
  }
}
