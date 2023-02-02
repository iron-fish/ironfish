/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { RawTransaction, RawTransactionSerde } from '../../../primitives'
import { Transaction } from '../../../primitives/transaction'
import { CurrencyUtils } from '../../../utils'
import { MintAssetOptions } from '../../../wallet/interfaces/mintAssetOptions'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export interface MintAssetRequest {
  account: string
  fee: string
  value: string
  assetId?: string
  expiration?: number
  expirationDelta?: number
  metadata?: string
  name?: string
  isRawTransaction?: boolean
}

export interface MintAssetResponse {
  assetId: string
  hash: string
  name: string
  value: string
  rawTransaction: string
}

export const MintAssetRequestSchema: yup.ObjectSchema<MintAssetRequest> = yup
  .object({
    account: yup.string().required(),
    fee: yup.string().required(),
    value: yup.string().required(),
    assetId: yup.string().optional(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    metadata: yup.string().optional(),
    name: yup.string().optional(),
    isRawTransaction: yup.boolean().optional(),
  })
  .defined()

export const MintAssetResponseSchema: yup.ObjectSchema<MintAssetResponse> = yup
  .object({
    assetId: yup.string().required(),
    hash: yup.string().required(),
    name: yup.string().required(),
    value: yup.string().required(),
    rawTransaction: yup.string().required(),
  })
  .defined()

router.register<typeof MintAssetRequestSchema, MintAssetResponse>(
  `${ApiNamespace.wallet}/mintAsset`,
  MintAssetRequestSchema,
  async (request, node): Promise<void> => {
    const account = node.wallet.getAccountByName(request.data.account)
    if (!account) {
      throw new ValidationError(`No account found with name ${request.data.account}`)
    }

    const fee = CurrencyUtils.decode(request.data.fee)
    if (fee < 1n) {
      throw new ValidationError(`Invalid transaction fee, ${fee}`)
    }

    const value = CurrencyUtils.decode(request.data.value)
    if (value <= 0) {
      throw new ValidationError('Invalid mint amount')
    }

    const expirationDelta =
      request.data.expirationDelta ?? node.config.get('transactionExpirationDelta')

    const rawTransaction = request.data.isRawTransaction
    let options: MintAssetOptions
    if (request.data.assetId) {
      options = {
        assetId: Buffer.from(request.data.assetId, 'hex'),
        expiration: request.data.expiration,
        fee,
        expirationDelta,
        value,
        rawTransaction,
      }
    } else {
      Assert.isNotUndefined(request.data.name, 'Must provide name or identifier to mint')

      const metadata: string = request.data.metadata ?? ''

      options = {
        expiration: request.data.expiration,
        fee,
        metadata: metadata,
        name: request.data.name,
        expirationDelta,
        value,
        rawTransaction,
      }
    }

    const transaction = await node.wallet.mint(node.memPool, account, options)
    Assert.isEqual(transaction.mints.length, 1)
    const mint = transaction.mints[0]
    let hash = ''
    let raw = ''
    if (transaction instanceof Transaction) {
      hash = transaction.hash().toString('hex')
    }

    if (transaction instanceof RawTransaction) {
      const rawTransactionBytes = RawTransactionSerde.serialize(transaction)
      raw = rawTransactionBytes.toString('hex')
    }

    request.end({
      assetId: mint.asset.id().toString('hex'),
      hash: hash,
      name: mint.asset.name().toString('utf8'),
      value: mint.value.toString(),
      rawTransaction: raw,
    })
  },
)
