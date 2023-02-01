/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import * as yup from 'yup'
import { CurrencyUtils } from '../../../utils'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { ERROR_CODES, ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type SendTransactionRequest = {
  fromAccountName: string
  receives: {
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
  receives: {
    publicAddress: string
    amount: string
    memo: string
    assetId?: string
  }[]
  fromAccountName: string
  hash: string
}

export const SendTransactionRequestSchema: yup.ObjectSchema<SendTransactionRequest> = yup
  .object({
    fromAccountName: yup.string().defined(),
    receives: yup
      .array(
        yup
          .object({
            publicAddress: yup.string().defined(),
            amount: yup.string().defined(),
            memo: yup.string().defined(),
            assetId: yup.string().optional(),
          })
          .defined(),
      )
      .defined(),
    fee: yup.string().defined(),
    expiration: yup.number().nullable().optional(),
    expirationDelta: yup.number().nullable().optional(),
    confirmations: yup.number().nullable().optional(),
  })
  .defined()

export const SendTransactionResponseSchema: yup.ObjectSchema<SendTransactionResponse> = yup
  .object({
    receives: yup
      .array(
        yup
          .object({
            publicAddress: yup.string().defined(),
            amount: yup.string().defined(),
            memo: yup.string().defined(),
            assetId: yup.string().optional(),
          })
          .defined(),
      )
      .defined(),
    fromAccountName: yup.string().defined(),
    hash: yup.string().defined(),
  })
  .defined()

router.register<typeof SendTransactionRequestSchema, SendTransactionResponse>(
  `${ApiNamespace.wallet}/sendTransaction`,
  SendTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const transaction = request.data

    const account = node.wallet.getAccountByName(transaction.fromAccountName)

    if (!account) {
      throw new ValidationError(`No account found with name ${transaction.fromAccountName}`)
    }

    // The node must be connected to the network first
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

    const receives = transaction.receives.map((receive) => {
      let assetId = Asset.nativeId()
      if (receive.assetId) {
        assetId = Buffer.from(receive.assetId, 'hex')
      }

      return {
        publicAddress: receive.publicAddress,
        amount: CurrencyUtils.decode(receive.amount),
        memo: receive.memo,
        assetId,
      }
    })

    const fee = CurrencyUtils.decode(transaction.fee)
    if (fee < 1n) {
      throw new ValidationError(`Invalid transaction fee, ${transaction.fee}`)
    }

    const totalByAssetIdentifier = new BufferMap<bigint>()
    totalByAssetIdentifier.set(Asset.nativeId(), fee)
    for (const { assetId, amount } of receives) {
      if (amount < 0) {
        throw new ValidationError(`Invalid transaction amount ${amount}.`)
      }

      const sum = totalByAssetIdentifier.get(assetId) ?? BigInt(0)
      totalByAssetIdentifier.set(assetId, sum + amount)
    }

    // Check that the node account is updated
    for (const [assetId, sum] of totalByAssetIdentifier) {
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
      const transactionPosted = await node.wallet.send(
        node.memPool,
        account,
        receives,
        BigInt(transaction.fee),
        transaction.expirationDelta ?? node.config.get('transactionExpirationDelta'),
        transaction.expiration,
        transaction.confirmations,
      )

      request.end({
        receives: transaction.receives,
        fromAccountName: account.name,
        hash: transactionPosted.hash().toString('hex'),
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
