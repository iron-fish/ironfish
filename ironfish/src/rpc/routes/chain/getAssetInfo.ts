/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import { ASSET_IDENTIFIER_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
 import { BlockHeader } from '../../../primitives'
 import { BufferUtils } from '../../../utils'
 import { ValidationError } from '../../adapters'
 import { ApiNamespace, router } from '../router'
 
 export type GetAssetInfoRequest = {
   assetIdentifier: string
 }
 
 export type GetAssetInfoResponse = {
    createdTransactionHash: string
    identifier: string
    metadata: string
    name: string
    nonce: number
    owner: string
    supply: number
 }
 
 export const GetAssetInfoRequestSchema: yup.ObjectSchema<GetAssetInfoRequest> = yup
   .object()
   .shape({
      assetIdentifier: yup.string(),
   })
   .defined()
 
 export const GetAssetInfoResponse: yup.ObjectSchema<GetAssetInfoResponse> = yup
       .object({
        createdTransactionHash: yup.string().defined(),
        identifier: yup.string().defined(),
        metadata: yup.string().defined(),
        name: yup.string().defined(),
        nonce: yup.number().defined(),
        owner: yup.string().defined(),
        supply: yup.number().defined(),
   })
   .defined()
 
 router.register<typeof GetAssetInfoRequestSchema, GetAssetInfoResponse>(
   `${ApiNamespace.chain}/getBlockInfo`,
   GetAssetInfoRequestSchema,
   async (request, node): Promise<void> => {
     let header: BlockHeader | null = null
     let error = ''
 
     if (request.data.assetIdentifier.length != ASSET_IDENTIFIER_LENGTH) {
        throw new ValidationError("Invalid asset identifier.")
     }

     let assetIdentifier = Buffer.from(request.data.assetIdentifier, 'hex')
 
     const asset = await node.chain.assets.get(assetIdentifier)  
 
     Assert.isNotUndefined(asset, 'no asset is found')

     request.end({
        createdTransactionHash: BufferUtils.toHuman(asset.createdTransactionHash),
        identifier: BufferUtils.toHuman(asset.identifier),
        metadata: BufferUtils.toHuman(asset.metadata),
        name: BufferUtils.toHuman(asset.name),
        nonce: Number(asset.nonce),
        owner: BufferUtils.toHuman(asset.owner),
        supply: Number(asset.supply),
     })
   },
 )
 