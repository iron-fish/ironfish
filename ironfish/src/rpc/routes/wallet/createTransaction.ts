/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import * as yup from 'yup'
import { BurnDescription } from '../../../primitives/burnDescription'
import { MintData, RawTransactionSerde } from '../../../primitives/rawTransaction'
import { CurrencyUtils } from '../../../utils'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { ERROR_CODES, ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type CreateTransactionRequest = {
  sender: string
  receives: {
    publicAddress: string
    amount: string
    memo: string
    assetId?: string
  }[]
  mints?: {
    assetId?: string
    name?: string
    metadata?: string
    value: string
  }[]
  burns?: {
    assetId: string
    value: string
  }[]
  fee?: string | null
  feeRate?: string | null
  expiration?: number
  expirationDelta?: number
  confirmations?: number
}

export type CreateTransactionResponse = {
  transaction: string
}

export const CreateTransactionRequestSchema: yup.ObjectSchema<CreateTransactionRequest> = yup
  .object({
    sender: yup.string().defined(),
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
    mints: yup
      .array(
        yup
          .object({
            assetId: yup.string().optional(),
            name: yup.string().optional(),
            metadata: yup.string().optional(),
            value: yup.string().defined(),
          })
          .defined(),
      )
      .optional(),
    burns: yup
      .array(
        yup
          .object({
            assetId: yup.string().defined(),
            value: yup.string().defined(),
          })
          .defined(),
      )
      .optional(),
    fee: yup.string().nullable().optional(),
    feeRate: yup.string().nullable().optional(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    confirmations: yup.number().optional(),
  })
  .defined()

export const CreateTransactionResponseSchema: yup.ObjectSchema<CreateTransactionResponse> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

router.register<typeof CreateTransactionRequestSchema, CreateTransactionResponse>(
  `${ApiNamespace.wallet}/createTransaction`,
  CreateTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const data = request.data

    const account = node.wallet.getAccountByName(data.sender)

    if (!account) {
      throw new ValidationError(`No account found with name ${data.sender}`)
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

    const totalByAssetIdentifier = new BufferMap<bigint>()
    if (data.fee) {
      const fee = CurrencyUtils.decode(data.fee)
      if (fee < 1n) {
        throw new ValidationError(`Invalid transaction fee, ${data.fee}`)
      }

      totalByAssetIdentifier.set(Asset.nativeId(), fee)
    }

    const receives = data.receives.map((receive) => {
      let assetId = Asset.nativeId()
      if (receive.assetId) {
        assetId = Buffer.from(receive.assetId, 'hex')
      }

      const amount = CurrencyUtils.decode(receive.amount)
      if (amount <= 0) {
        throw new ValidationError(`Invalid transaction amount ${amount}.`)
      }

      const sum = totalByAssetIdentifier.get(assetId) ?? 0n
      totalByAssetIdentifier.set(assetId, sum + amount)

      return {
        publicAddress: receive.publicAddress,
        amount: amount,
        memo: receive.memo,
        assetId,
      }
    })

    const mints: MintData[] = []
    if (data.mints) {
      for (const mint of data.mints) {
        let mintData: MintData
        if (mint.assetId) {
          const record = await node.chain.getAssetById(Buffer.from(mint.assetId, 'hex'))
          if (!record) {
            throw new ValidationError(
              `Asset not found. Cannot mint for identifier '${mint.assetId}'`,
            )
          }

          mintData = {
            name: record.name.toString('utf8'),
            metadata: record.metadata.toString('utf8'),
            value: CurrencyUtils.decode(mint.value),
          }
        } else {
          if (mint.name === undefined) {
            throw new ValidationError('Must provide name or identifier to mint')
          }
          mintData = {
            name: mint.name,
            metadata: mint.metadata ?? '',
            value: CurrencyUtils.decode(mint.value),
          }
        }

        mints.push(mintData)
      }
    }

    const burns: BurnDescription[] = []
    if (data.burns) {
      data.burns.map((burn) => {
        let assetId = Asset.nativeId()
        if (burn.assetId) {
          assetId = Buffer.from(burn.assetId, 'hex')
        }
        burns.push({
          assetId: assetId,
          value: CurrencyUtils.decode(burn.value),
        })
      })
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

    let rawTransaction

    try {
      if (data.fee) {
        rawTransaction = await node.wallet.createTransaction(account, receives, mints, burns, {
          fee: CurrencyUtils.decode(data.fee),
          expirationDelta:
            data.expirationDelta ?? node.config.get('transactionExpirationDelta'),
          expiration: data.expiration,
          confirmations: data.confirmations,
        })
      } else {
        let feeRate

        if (data.feeRate) {
          feeRate = CurrencyUtils.decode(data.feeRate)

          if (feeRate < 1n) {
            throw new ValidationError(`Invalid transaction fee rate, ${data.feeRate}`)
          }
        } else {
          feeRate = node.memPool.feeEstimator.estimateFeeRate('medium')
        }

        rawTransaction = await node.wallet.createTransaction(account, receives, mints, burns, {
          expirationDelta:
            data.expirationDelta ?? node.config.get('transactionExpirationDelta'),
          expiration: data.expiration,
          confirmations: data.confirmations,
          feeRate: feeRate,
        })
      }

      const rawTransactionBytes = RawTransactionSerde.serialize(rawTransaction)
      request.end({
        transaction: rawTransactionBytes.toString('hex'),
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
