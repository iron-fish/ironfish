/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import * as yup from 'yup'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { ERROR_CODES, ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type SendTransactionRequest = {
  account: string
  outputs: {
    publicAddress: string
    amount: string
    memo: string
    assetId?: string
  }[]
  fee: string
  expiration?: number | null
  expirationDelta?: number | null
  confirmations?: number | null
}

export type SendTransactionResponse = {
  account: string
  hash: string
  transaction: string
}

export const SendTransactionRequestSchema: yup.ObjectSchema<SendTransactionRequest> = yup
  .object({
    account: yup.string().defined(),
    outputs: yup
      .array(
        yup
          .object({
            publicAddress: yup.string().defined(),
            amount: YupUtils.currency({ min: 0n }).defined(),
            memo: yup.string().defined(),
            assetId: yup.string().optional(),
          })
          .defined(),
      )
      .defined(),
    fee: YupUtils.currency({ min: 1n }).defined(),
    expiration: yup.number().nullable().optional(),
    expirationDelta: yup.number().nullable().optional(),
    confirmations: yup.number().nullable().optional(),
  })
  .defined()

export const SendTransactionResponseSchema: yup.ObjectSchema<SendTransactionResponse> = yup
  .object({
    account: yup.string().defined(),
    hash: yup.string().defined(),
    transaction: yup.string().defined(),
  })
  .defined()

router.register<typeof SendTransactionRequestSchema, SendTransactionResponse>(
  `${ApiNamespace.wallet}/sendTransaction`,
  SendTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    if (!node.peerNetwork.isReady) {
      throw new ValidationError(
        `Your node must be connected to the Iron Fish network to send a transaction`,
      )
    }

    if (!node.chain.synced) {
      throw new ValidationError(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
    }

    const outputs = request.data.outputs.map((output) => ({
      publicAddress: output.publicAddress,
      amount: CurrencyUtils.decode(output.amount),
      memo: output.memo,
      assetId: output.assetId ? Buffer.from(output.assetId, 'hex') : Asset.nativeId(),
    }))

    const fee = CurrencyUtils.decode(request.data.fee)

    const totalByAssetId = new BufferMap<bigint>()
    totalByAssetId.set(Asset.nativeId(), fee)

    for (const { assetId, amount } of outputs) {
      const sum = totalByAssetId.get(assetId) ?? 0n
      totalByAssetId.set(assetId, sum + amount)
    }

    // Check that the node has enough balance
    for (const [assetId, sum] of totalByAssetId) {
      const balance = await node.wallet.getBalance(account, assetId)

      if (balance.confirmed < sum) {
        throw new ValidationError(
          `Your balance is too low. Add funds to your account first`,
          undefined,
          ERROR_CODES.INSUFFICIENT_BALANCE,
        )
      }
    }

    try {
      const transaction = await node.wallet.send(
        node.memPool,
        account,
        outputs,
        fee,
        request.data.expirationDelta ?? node.config.get('transactionExpirationDelta'),
        request.data.expiration,
        request.data.confirmations,
      )

      request.end({
        account: account.name,
        transaction: transaction.serialize().toString('hex'),
        hash: transaction.hash().toString('hex'),
      })
    } catch (e) {
      if (e instanceof NotEnoughFundsError) {
        throw new ValidationError(
          `Not enough unspent notes available to fund the transaction. Please wait for any pending transactions to be confirmed.`,
          400,
          ERROR_CODES.INSUFFICIENT_BALANCE,
        )
      }
      throw e
    }
  },
)
