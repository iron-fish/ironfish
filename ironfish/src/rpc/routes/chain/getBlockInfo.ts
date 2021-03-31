/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { ValidationError } from '../../adapters'

export type GetBlockInfoRequest = { hash: string }

export type GetBlockInfoResponse = {
  block: {
    graffiti: string
    hash: string
    previousBlockHash: string
    sequence: number
    timestamp: number
  }
}

export const GetBlockInfoRequestSchema: yup.ObjectSchema<GetBlockInfoRequest> = yup
  .object({
    hash: yup.string().defined(),
  })
  .defined()

export const GetBlockInfoResponseSchema: yup.ObjectSchema<GetBlockInfoResponse> = yup
  .object({
    block: yup
      .object({
        graffiti: yup.string().defined(),
        hash: yup.string().defined(),
        previousBlockHash: yup.string().defined(),
        sequence: yup.number().defined(),
        timestamp: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof GetBlockInfoRequestSchema, GetBlockInfoResponse>(
  `${ApiNamespace.chain}/getBlockInfo`,
  GetBlockInfoRequestSchema,
  async (request, node): Promise<void> => {
    const hash = Buffer.from(request.data.hash, 'hex')
    const header = await node.captain.chain.getBlockHeader(hash)

    if (!header) {
      throw new ValidationError(`No block with hash ${request.data.hash}`)
    }

    request.status(200).end({
      block: {
        graffiti: header.graffiti.toString('hex'),
        hash: request.data.hash,
        previousBlockHash: header.previousBlockHash.toString('hex'),
        sequence: Number(header.sequence),
        timestamp: header.timestamp.valueOf(),
      },
    })
  },
)
