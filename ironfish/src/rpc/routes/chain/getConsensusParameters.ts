/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { IronfishNode } from '../../../node'
import { RpcRequest } from '../../request'

interface ConsensusParameters {
  allowedBlockFuturesSeconds: number
  genesisSupplyInIron: number
  targetBlockTimeInSeconds: number
  targetBucketTimeInSeconds: number
  maxBlockSizeBytes: number
  minFee: number
}

export type Request = Record<string, never> | undefined
export type Response = ConsensusParameters

export const RequestSchema: yup.MixedSchema<Request> = yup.mixed().oneOf([undefined] as const)

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    allowedBlockFuturesSeconds: yup.number().defined(),
    genesisSupplyInIron: yup.number().defined(),
    targetBlockTimeInSeconds: yup.number().defined(),
    targetBucketTimeInSeconds: yup.number().defined(),
    maxBlockSizeBytes: yup.number().defined(),
    minFee: yup.number().defined(),
  })
  .defined()

export const route = 'getConsensusParameters'
export const handle = (request: RpcRequest<Request, Response>, node: IronfishNode): void => {
  Assert.isNotNull(node.chain.consensus, 'no consensus parameters')

  const consensusParameters = node.chain.consensus.parameters

  request.end({
    allowedBlockFuturesSeconds: consensusParameters.allowedBlockFutureSeconds,
    genesisSupplyInIron: consensusParameters.genesisSupplyInIron,
    targetBlockTimeInSeconds: consensusParameters.targetBlockTimeInSeconds,
    targetBucketTimeInSeconds: consensusParameters.targetBucketTimeInSeconds,
    maxBlockSizeBytes: consensusParameters.maxBlockSizeBytes,
    minFee: consensusParameters.minFee,
  })
}
