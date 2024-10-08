/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Asset,
  ASSET_METADATA_LENGTH,
  ASSET_NAME_LENGTH,
  MEMO_LENGTH,
} from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { Wallet } from '../../../wallet'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type CreateTransactionRequest = {
  account?: string
  outputs: {
    publicAddress: string
    amount: string
    memo?: string
    memoHex?: string
    assetId?: string
  }[]
  mints?: {
    assetId?: string
    name?: string
    metadata?: string
    value: string
    transferOwnershipTo?: string
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
  notes?: string[]
}

export type CreateTransactionResponse = {
  transaction: string
}

export const CreateTransactionRequestSchema: yup.ObjectSchema<CreateTransactionRequest> = yup
  .object({
    account: yup.string().defined(),
    outputs: yup
      .array(
        yup
          .object({
            publicAddress: yup.string().defined(),
            amount: YupUtils.currency({ min: 1n }).defined(),
            memo: yup.string().optional().max(MEMO_LENGTH),
            memoHex: yup
              .string()
              .optional()
              .max(MEMO_LENGTH * 2, 'Must be 32 byte hex encoded'),
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
            name: yup.string().optional().max(ASSET_NAME_LENGTH),
            metadata: yup.string().optional().max(ASSET_METADATA_LENGTH),
            value: YupUtils.currency({ min: 0n }).defined(),
            transferOwnershipTo: yup.string().optional(),
          })
          .defined(),
      )
      .optional(),
    burns: yup
      .array(
        yup
          .object({
            assetId: yup.string().defined(),
            value: YupUtils.currency({ min: 1n }).defined(),
          })
          .defined(),
      )
      .optional(),
    fee: YupUtils.currency({ min: 1n }).nullable().optional(),
    feeRate: YupUtils.currency({ min: 1n }).nullable().optional(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    confirmations: yup.number().optional(),
    notes: yup.array(yup.string().defined()).optional(),
  })
  .defined()

export const CreateTransactionResponseSchema: yup.ObjectSchema<CreateTransactionResponse> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

routes.register<typeof CreateTransactionRequestSchema, CreateTransactionResponse>(
  `${ApiNamespace.wallet}/createTransaction`,
  CreateTransactionRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet', 'assetsVerifier')

    const account = getAccount(node.wallet, request.data.account)

    const params: Parameters<Wallet['createTransaction']>[0] = {
      account: account,
      confirmations: request.data.confirmations,
      expiration: request.data.expiration,
      expirationDelta: request.data.expirationDelta,
    }

    if (request.data.outputs) {
      params.outputs = []

      for (const output of request.data.outputs) {
        if (output.memo && output.memoHex) {
          throw new RpcValidationError('Only one of memo or memoHex may be set for each output')
        }

        let memo: Buffer
        if (output.memo) {
          memo = Buffer.from(output.memo, 'utf-8')
        } else if (output.memoHex) {
          memo = Buffer.from(output.memoHex, 'hex')
        } else {
          memo = Buffer.alloc(0)
        }

        params.outputs.push({
          publicAddress: output.publicAddress,
          amount: CurrencyUtils.decode(output.amount),
          memo: memo,
          assetId: output.assetId ? Buffer.from(output.assetId, 'hex') : Asset.nativeId(),
        })
      }
    }

    if (request.data.mints) {
      params.mints = []

      for (const mint of request.data.mints) {
        if (mint.assetId == null && mint.name == null) {
          throw new RpcValidationError('Must provide name or identifier to mint')
        }

        let creator = account.publicAddress
        let name = mint.name
        let metadata = mint.metadata ?? ''

        if (mint.assetId) {
          const assetId = Buffer.from(mint.assetId, 'hex')
          const asset = await account.getAsset(assetId)

          if (!asset) {
            throw new RpcValidationError(`Error minting: Asset ${mint.assetId} not found.`)
          }

          creator = asset.creator.toString('hex')
          name = asset.name.toString('utf8')
          metadata = asset.metadata.toString('utf8')
        }

        Assert.isNotUndefined(creator)
        Assert.isNotUndefined(name)
        Assert.isNotUndefined(metadata)

        params.mints.push({
          creator,
          name,
          metadata,
          transferOwnershipTo: mint.transferOwnershipTo,
          value: CurrencyUtils.decode(mint.value),
        })
      }
    }

    if (request.data.burns) {
      params.burns = []

      for (const burn of request.data.burns) {
        params.burns.push({
          assetId: burn.assetId ? Buffer.from(burn.assetId, 'hex') : Asset.nativeId(),
          value: CurrencyUtils.decode(burn.value),
        })
      }
    }

    if (request.data.fee) {
      params.fee = CurrencyUtils.decode(request.data.fee)
    } else if (request.data.feeRate) {
      params.feeRate = CurrencyUtils.decode(request.data.feeRate)
    } else {
      Assert.isNotNull(node.wallet.nodeClient)
      const avgFeeRateResponse = await node.wallet.nodeClient.chain.estimateFeeRate({
        priority: 'average',
      })
      params.feeRate = CurrencyUtils.decode(avgFeeRateResponse.content.rate)
    }

    if (request.data.notes) {
      params.notes = []
      for (const noteHash of request.data.notes) {
        params.notes.push(Buffer.from(noteHash, 'hex'))
      }
    }

    try {
      const transaction = await node.wallet.createTransaction(params)
      const serialized = RawTransactionSerde.serialize(transaction)

      request.end({
        transaction: serialized.toString('hex'),
      })
    } catch (e) {
      if (e instanceof NotEnoughFundsError) {
        // We are overriding the error message from the node to include verified assets in their appropriate denomination.
        const assetData = node.assetsVerifier.getAssetData(e.assetId)
        const renderedAmountNeeded = CurrencyUtils.render(
          e.amountNeeded,
          true,
          e.assetId,
          assetData,
        )
        const renderedAmount = CurrencyUtils.render(e.amount, false, e.assetId, assetData)
        const message = `Insufficient funds: Needed ${renderedAmountNeeded} but have ${renderedAmount} available to spend. Please fund your account and/or wait for any pending transactions to be confirmed.`
        throw new RpcValidationError(message, 400, RPC_ERROR_CODES.INSUFFICIENT_BALANCE)
      }
      throw e
    }
  },
)
