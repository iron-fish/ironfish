/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, MEMO_LENGTH } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { Wallet } from '../../../wallet'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type SendTransactionRequest = {
  account?: string
  outputs: {
    publicAddress: string
    amount: string
    memo?: string
    memoHex?: string
    assetId?: string
  }[]
  fee?: string
  feeRate?: string
  expiration?: number | null
  expirationDelta?: number | null
  confirmations?: number | null
  notes?: string[]
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
    fee: YupUtils.currency({ min: 1n }).optional(),
    feeRate: YupUtils.currency({ min: 1n }).optional(),
    expiration: yup.number().nullable().optional(),
    expirationDelta: yup.number().nullable().optional(),
    confirmations: yup.number().nullable().optional(),
    notes: yup.array(yup.string().defined()).optional(),
  })
  .defined()

export const SendTransactionResponseSchema: yup.ObjectSchema<SendTransactionResponse> = yup
  .object({
    account: yup.string().defined(),
    hash: yup.string().defined(),
    transaction: yup.string().defined(),
  })
  .defined()

routes.register<typeof SendTransactionRequestSchema, SendTransactionResponse>(
  `${ApiNamespace.wallet}/sendTransaction`,
  SendTransactionRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet', 'assetsVerifier')

    Assert.isNotNull(context.wallet.nodeClient)
    const account = getAccount(context.wallet, request.data.account)

    const status = await context.wallet.nodeClient.node.getStatus()

    if (!status.content.blockchain.synced) {
      throw new RpcValidationError(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
    }

    const outputs = request.data.outputs.map((output) => {
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

      return {
        publicAddress: output.publicAddress,
        amount: CurrencyUtils.decode(output.amount),
        memo: memo,
        assetId: output.assetId ? Buffer.from(output.assetId, 'hex') : Asset.nativeId(),
      }
    })

    const params: Parameters<Wallet['send']>[0] = {
      account,
      outputs,
      expiration: request.data.expiration ?? undefined,
      expirationDelta: request.data.expirationDelta ?? undefined,
      confirmations: request.data.confirmations ?? undefined,
    }

    const totalByAssetId = new BufferMap<bigint>()

    for (const { assetId, amount } of outputs) {
      const sum = totalByAssetId.get(assetId) ?? 0n
      totalByAssetId.set(assetId, sum + amount)
    }

    if (request.data.fee) {
      params.fee = CurrencyUtils.decode(request.data.fee)
      totalByAssetId.set(Asset.nativeId(), params.fee)
    }

    if (request.data.feeRate) {
      params.feeRate = CurrencyUtils.decode(request.data.feeRate)
    }

    // Check that the node has enough balance
    for (const [assetId, sum] of totalByAssetId) {
      const balance = await context.wallet.getBalance(account, assetId, {
        confirmations: request.data.confirmations ?? undefined,
      })

      if (balance.available < sum) {
        throw new RpcValidationError(
          `Your balance is too low. Add funds to your account first`,
          undefined,
          RPC_ERROR_CODES.INSUFFICIENT_BALANCE,
        )
      }
    }

    if (request.data.notes) {
      params.notes = request.data.notes.map((noteHash) => Buffer.from(noteHash, 'hex'))
    }

    try {
      const transaction = await context.wallet.send(params)

      request.end({
        account: account.name,
        transaction: transaction.serialize().toString('hex'),
        hash: transaction.hash().toString('hex'),
      })
    } catch (e) {
      if (e instanceof NotEnoughFundsError) {
        // We are overriding the error message from the node to include verified assets in their appropriate denomination.
        const assetData = context.assetsVerifier.getAssetData(e.assetId)
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
