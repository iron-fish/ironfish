/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { IronfishNode } from '../../../node'
import { RawTransaction, RawTransactionSerde } from '../../../primitives/rawTransaction'
import { CurrencyUtils } from '../../../utils'
import { Account } from '../../../wallet'
import { ERROR_CODES, ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

interface MintParams {
  value: string
  assetId?: string
  metadata?: string
  name?: string
}

interface BurnParams {
  assetId: string
  value: string
}

const MintParamsSchema: yup.ObjectSchema<MintParams> = yup
  .object({
    value: yup.string().defined(),
    assetId: yup.string().optional(),
    metadata: yup.string().optional(),
    name: yup.string().optional(),
  })
  .defined()

const BurnParamsSchema: yup.ObjectSchema<BurnParams> = yup
  .object({
    assetId: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

// Use different method number for different transaction type
// 0: send
// 1: mint
// 2: burn
export interface CreateRawTransactionRequest {
  account: string
  receives: {
    publicAddress: string
    amount: string
    memo: string
    assetId?: string
  }[]
  fee: string
  expiration?: number
  expirationDelta?: number
  data: {
    method: '0' | '1' | '2'
    params?: MintParams | BurnParams
  }
}

export interface CreateRawTransactionResponse {
  method: '0' | '1' | '2'
  rawTransaction: string
}

export const CreateRawTransactionRequestSchema: yup.ObjectSchema<CreateRawTransactionRequest> =
  yup
    .object({
      account: yup.string().defined(),
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
      expiration: yup.number().optional(),
      expirationDelta: yup.number().optional(),
      data: yup
        .object({
          method: yup.string().oneOf(['0', '1', '2']).defined(),
          params: yup.mixed().oneOf([]).optional(),
        })
        .defined(),
    })
    .defined()

export const CreateRawTransactionResponseSchema: yup.ObjectSchema<CreateRawTransactionResponse> =
  yup
    .object({
      method: yup.string().oneOf(['0', '1', '2']).defined(),
      rawTransaction: yup.string().required(),
    })
    .defined()

router.register<typeof CreateRawTransactionRequestSchema, CreateRawTransactionResponse>(
  `${ApiNamespace.wallet}/createRawTransaction`,
  CreateRawTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = node.wallet.getAccountByName(request.data.account)
    if (!account) {
      throw new ValidationError(`No account found with name ${request.data.account}`)
    }

    const fee = CurrencyUtils.decode(request.data.fee)
    if (fee < 1n) {
      throw new ValidationError(`Invalid transaction fee, ${fee}`)
    }

    const heaviestHead = node.chain.head
    const expiration =
      request.data.expiration ??
      heaviestHead.sequence +
        (request.data.expirationDelta ?? node.config.get('transactionExpirationDelta'))

    const method = request.data.data.method
    let rawTransaction: RawTransaction

    switch (method) {
      case '0':
        rawTransaction = await handleSendTransaction(
          request.data,
          node,
          account,
          fee,
          expiration,
        )
        break
      case '1':
        Assert.isNotUndefined(
          request.data.data.params,
          'Must provide params for mint transaction',
        )
        rawTransaction = await handleMintTransaction(
          request.data.data.params as MintParams,
          node,
          account,
          fee,
          expiration,
        )
        break
      case '2':
        Assert.isNotUndefined(
          request.data.data.params,
          'Must provide params for burn transaction',
        )
        rawTransaction = await handleBurnTransaction(
          request.data.data.params as BurnParams,
          node,
          account,
          fee,
          expiration,
        )
        break
    }

    request.end({
      method: request.data.data.method,
      rawTransaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
    })
  },
)

const handleSendTransaction = async (
  request: CreateRawTransactionRequest,
  node: IronfishNode,
  account: Account,
  fee: bigint,
  expiration: number,
): Promise<RawTransaction> => {
  const receives = request.receives.map((receive) => {
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

  return await node.wallet.createTransaction(account, receives, [], [], fee, expiration)
}

const handleMintTransaction = async (
  params: MintParams,
  node: IronfishNode,
  account: Account,
  fee: bigint,
  expiration: number,
): Promise<RawTransaction> => {
  const rawValue = params.value
  if (!rawValue) {
    throw new ValidationError('Mint amount required')
  } else {
    const value = CurrencyUtils.decodeIron(rawValue)
    if (value <= 0) {
      throw new ValidationError('Invalid mint amount')
    }
    let asset: Asset
    if (params.assetId) {
      const record = await node.chain.getAssetById(Buffer.from(params.assetId, 'hex'))
      if (!record) {
        throw new Error(`Asset not found. Cannot mint for identifier '${params.assetId}'`)
      }

      asset = new Asset(
        account.spendingKey,
        record.name.toString('utf8'),
        record.metadata.toString('utf8'),
      )
      // Verify the stored asset produces the same identifier before building a transaction
      if (!Buffer.from(params.assetId, 'hex').equals(asset.id())) {
        throw new Error(`Unauthorized to mint for asset '${params.assetId}'`)
      }
    } else {
      Assert.isNotUndefined(
        params.metadata,
        'Must provide metadata and name or identifier to mint',
      )
      Assert.isNotUndefined(params.name, 'Must provide metadata and name or identifier to mint')
      asset = new Asset(account.spendingKey, params.name, params.metadata)
    }
    return await node.wallet.createTransaction(
      account,
      [],
      [{ asset, value }],
      [],
      fee,
      expiration,
    )
  }
}

const handleBurnTransaction = async (
  params: BurnParams,
  node: IronfishNode,
  account: Account,
  fee: bigint,
  expiration: number,
): Promise<RawTransaction> => {
  const rawValue = params.value
  if (!rawValue) {
    throw new ValidationError('Burn amount required')
  } else {
    const value = CurrencyUtils.decodeIron(rawValue)
    if (value <= 0) {
      throw new ValidationError('Invalid mint amount')
    }
    return await node.wallet.createTransaction(
      account,
      [],
      [],
      [{ assetId: Buffer.from(params.assetId, 'hex'), value }],
      fee,
      expiration,
    )
  }
}
