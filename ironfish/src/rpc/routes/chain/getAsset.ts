/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_ID_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { RpcRequest } from '../../request'

export type Request = {
  id: string
}

export type Response = {
  createdTransactionHash: string
  id: string
  metadata: string
  name: string
  owner: string
  supply: string
}

export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object()
  .shape({
    id: yup.string(),
  })
  .defined()

export const Response: yup.ObjectSchema<Response> = yup
  .object({
    createdTransactionHash: yup.string().defined(),
    id: yup.string().defined(),
    metadata: yup.string().defined(),
    name: yup.string().defined(),
    owner: yup.string().defined(),
    supply: yup.string().defined(),
  })
  .defined()

export const route = 'getAsset'
export const handle = async (
  request: RpcRequest<Request, Response>,
  node: IronfishNode,
): Promise<void> => {
  const id = Buffer.from(request.data.id, 'hex')

  if (id.byteLength !== ASSET_ID_LENGTH) {
    throw new ValidationError(
      `Asset identifier is invalid length, expected ${ASSET_ID_LENGTH} but got ${id.byteLength}`,
    )
  }

  const asset = await node.chain.getAssetById(id)

  if (!asset) {
    throw new ValidationError(`No asset found with identifier ${request.data.id}`)
  }

  request.end({
    createdTransactionHash: asset.createdTransactionHash.toString('hex'),
    id: asset.id.toString('hex'),
    metadata: asset.metadata.toString('hex'),
    name: asset.name.toString('hex'),
    owner: asset.owner.toString('hex'),
    supply: CurrencyUtils.encode(asset.supply),
  })
}
