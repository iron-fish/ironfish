/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { CurrencyUtils } from '../../../utils'
import { Wallet } from '../../../wallet'
import { NotEnoughFundsError } from '../../../wallet/errors'
import { ERROR_CODES, ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'
import { CreateTransactionRequestSchema, CreateTransactionResponse } from './createTransaction'
import { getAccount } from './utils'

router.register<typeof CreateTransactionRequestSchema, CreateTransactionResponse>(
  `${ApiNamespace.wallet}/createTransactionAirdrop`,
  CreateTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    const params: Parameters<Wallet['createTransaction']>[0] = {
      account: account,
      confirmations: request.data.confirmations,
      expiration: request.data.expiration,
      expirationDelta: request.data.expirationDelta,
    }

    if (request.data.outputs) {
      params.outputs = []

      for (const output of request.data.outputs) {
        params.outputs.push({
          publicAddress: output.publicAddress,
          amount: CurrencyUtils.decode(output.amount),
          memo: output.memo,
          assetId: output.assetId ? Buffer.from(output.assetId, 'hex') : Asset.nativeId(),
        })
      }
    }

    if (request.data.mints) {
      params.mints = []

      for (const mint of request.data.mints) {
        if (mint.assetId == null && mint.name == null) {
          throw new ValidationError('Must provide name or identifier to mint')
        }

        let name = mint.name
        let metadata = mint.metadata ?? ''

        if (mint.assetId) {
          const assetId = Buffer.from(mint.assetId, 'hex')
          const asset = await account.getAsset(assetId)

          if (!asset) {
            throw new ValidationError(`Error minting: Asset ${mint.assetId} not found.`)
          }

          name = asset.name.toString('utf8')
          metadata = asset.metadata.toString('utf8')
        }

        Assert.isNotUndefined(name)
        Assert.isNotUndefined(metadata)

        params.mints.push({
          name,
          metadata,
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
      params.feeRate = node.memPool.feeEstimator.estimateFeeRate('average')
    }

    try {
      const transaction = await node.wallet.createTransaction(params)
      for (const spend of transaction.spends) {
        const decryptedNote = await account.getDecryptedNote(spend.note.hash())
        Assert.isNotUndefined(
          decryptedNote,
          'Decrypted note that we are marking as spent was null.',
        )
        await node.wallet.walletDb.deleteUnspentNoteHash(
          account,
          spend.note.hash(),
          decryptedNote,
        )
        await node.wallet.walletDb.saveDecryptedNote(account, spend.note.hash(), {
          ...decryptedNote,
          spent: true,
        })
      }
      const serialized = RawTransactionSerde.serialize(transaction)

      request.end({
        transaction: serialized.toString('hex'),
      })
    } catch (e) {
      if (e instanceof NotEnoughFundsError) {
        throw new ValidationError(e.message, 400, ERROR_CODES.INSUFFICIENT_BALANCE)
      }
      throw e
    }
  },
)
