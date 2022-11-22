/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ApiNamespace, router } from '../router'

interface ConsensusParameters {
  genesisBlockPrevious: string
  genesisBlockSequence: number
  allowedBlockFuturesSeconds: number
  genesisSupplyInIron: number
  targetBlockTimeInSeconds: number
  maxSyncedAgeBlocks: number
  targetBucketTimeInSeconds: number
  maxBlockSizeBytes: number
}

export type GetConsensusParametersRequest = Record<string, never> | undefined
export type GetConsensusParametersResponse = ConsensusParameters

export const GetConsensusParametersRequestSchema: yup.MixedSchema<GetConsensusParametersRequest> =
  yup.mixed().oneOf([undefined] as const)

export const GetConsensusParametersResponseSchema: yup.ObjectSchema<GetConsensusParametersResponse> =
  yup
    .object({
      genesisBlockPrevious: yup.string().defined(),
      genesisBlockSequence: yup.number().defined(),
      allowedBlockFuturesSeconds: yup.number().defined(),
      genesisSupplyInIron: yup.number().defined(),
      targetBlockTimeInSeconds: yup.number().defined(),
      maxSyncedAgeBlocks: yup.number().defined(),
      targetBucketTimeInSeconds: yup.number().defined(),
      maxBlockSizeBytes: yup.number().defined(),
    })
    .defined()

router.register<typeof GetConsensusParametersRequestSchema, GetConsensusParametersResponse>(
  `${ApiNamespace.chain}/getConsensusParameters`,
  GetConsensusParametersRequestSchema,
  (request, node): void => {
    Assert.isNotNull(node.chain.consensus, 'no consensus parameters')

    const consensusParameters = node.chain.consensus.parameters

    request.end({
      genesisBlockPrevious: consensusParameters.genesisBlockPrevious.toString(),
      genesisBlockSequence: consensusParameters.genesisBlockSequence,
      allowedBlockFuturesSeconds: consensusParameters.allowedBlockFutureSeconds,
      genesisSupplyInIron: consensusParameters.genesisSupplyInIron,
      targetBlockTimeInSeconds: consensusParameters.targetBlockTimeInSeconds,
      maxSyncedAgeBlocks: consensusParameters.maxSyncedAgeBlocks,
      targetBucketTimeInSeconds: consensusParameters.targetBucketTimeInSeconds,
      maxBlockSizeBytes: consensusParameters.maxBlockSizeBytes,
    })
  },
)
