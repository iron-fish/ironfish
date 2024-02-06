/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ConsensusParameters } from '../../../consensus/consensus'
import { FullNode } from '../../../node'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type GetConsensusParametersRequest = Record<string, never> | undefined
export type GetConsensusParametersResponse = ConsensusParameters

export const GetConsensusParametersRequestSchema: yup.MixedSchema<GetConsensusParametersRequest> =
  yup.mixed().oneOf([undefined] as const)

export const GetConsensusParametersResponseSchema: yup.ObjectSchema<GetConsensusParametersResponse> =
  yup
    .object({
      allowedBlockFutureSeconds: yup.number().defined(),
      genesisSupplyInIron: yup.number().defined(),
      targetBlockTimeInSeconds: yup.number().defined(),
      targetBucketTimeInSeconds: yup.number().defined(),
      maxBlockSizeBytes: yup.number().defined(),
      minFee: yup.number().defined(),
      enableAssetOwnership: yup.number().nullable().defined(),
      enforceSequentialBlockTime: yup.number().nullable().defined(),
      enableFishHash: yup.number().nullable().defined(),
    })
    .defined()

routes.register<typeof GetConsensusParametersRequestSchema, GetConsensusParametersResponse>(
  `${ApiNamespace.chain}/getConsensusParameters`,
  GetConsensusParametersRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    const consensusParameters = node.chain.consensus.parameters

    request.end(consensusParameters)
  },
)
