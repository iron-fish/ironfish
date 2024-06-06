/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_ID_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { AssetValue } from '../../../blockchain/database/assetValue'
import { FullNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { AssetStatus } from '../../../wallet'
import { RpcNotFoundError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { RpcAsset, RpcAssetSchema } from './types'

export type GetAssetRequest = {
  id: string
}

export type GetAssetResponse = RpcAsset

export const GetAssetRequestSchema: yup.ObjectSchema<GetAssetRequest> = yup
  .object()
  .shape({
    id: yup.string(),
  })
  .defined()

export const GetAssetResponse: yup.ObjectSchema<GetAssetResponse> = RpcAssetSchema.defined()

/**
 * Note: This logic will be deprecated when we move the field `status` from the Asset response object. The status field has
 * more to do with the transaction than the asset itself.
 *
 * @param node: FullNode
 * @param asset: AssetValue
 * @returns Promise<AssetStatus>
 */
async function getAssetStatus(node: FullNode, asset: AssetValue): Promise<AssetStatus> {
  const blockHash = await node.chain.getBlockHashByTransactionHash(asset.createdTransactionHash)
  if (!blockHash) {
    return AssetStatus.UNKNOWN
  }

  const blockHeader = await node.chain.getHeader(blockHash)

  if (!blockHeader) {
    return AssetStatus.UNKNOWN
  }

  return blockHeader.sequence + node.chain.config.get('confirmations') <
    node.chain.head.sequence
    ? AssetStatus.CONFIRMED
    : AssetStatus.UNCONFIRMED
}

routes.register<typeof GetAssetRequestSchema, GetAssetResponse>(
  `${ApiNamespace.chain}/getAsset`,
  GetAssetRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const id = Buffer.from(request.data.id, 'hex')

    if (id.byteLength !== ASSET_ID_LENGTH) {
      throw new RpcValidationError(
        `Asset identifier is invalid length, expected ${ASSET_ID_LENGTH} but got ${id.byteLength}`,
      )
    }

    const asset = await node.chain.getAssetById(id)
    if (!asset) {
      throw new RpcNotFoundError(`No asset found with identifier ${request.data.id}`)
    }

    request.end({
      createdTransactionHash: asset.createdTransactionHash.toString('hex'),
      id: asset.id.toString('hex'),
      metadata: asset.metadata.toString('hex'),
      name: asset.name.toString('hex'),
      nonce: asset.nonce,
      creator: asset.creator.toString('hex'),
      owner: asset.owner.toString('hex'),
      supply: CurrencyUtils.encode(asset.supply),
      status: await getAssetStatus(node, asset),
      verification: node.assetsVerifier.verify(asset.id),
    })
  },
)
