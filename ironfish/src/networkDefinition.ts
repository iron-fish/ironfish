/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ConsensusParameters } from './consensus'
import { SerializedBlock } from './primitives/block'

export type NetworkDefinition = {
  id: number
  bootstrapNodes: string[]
  genesis: SerializedBlock
  consensus: ConsensusParameters
}

export const networkDefinitionSchema: yup.ObjectSchema<NetworkDefinition> = yup
  .object({
    id: yup.number().integer().min(0).defined(),
    bootstrapNodes: yup.array().of(yup.string().defined()).defined(),
    genesis: yup
      .object({
        header: yup
          .object({
            sequence: yup.number().integer().defined(),
            previousBlockHash: yup.string().defined(),
            noteCommitment: yup.mixed<Buffer>().defined(),
            transactionCommitment: yup.mixed<Buffer>().defined(),
            target: yup.string().defined(),
            randomness: yup.string().defined(),
            timestamp: yup.number().integer().defined(),
            noteSize: yup.number().integer().nullable().defined(),
            work: yup.string().optional(),
            nullifierSize: yup.number().integer().nullable().defined(),
            graffiti: yup.string().defined(),
          })
          .defined(),
        transactions: yup.array().of<Buffer>(yup.mixed<Buffer>()).defined(),
      })
      .defined(),
    consensus: yup
      .object({
        allowedBlockFutureSeconds: yup.number().integer().defined(),
        genesisSupplyInIron: yup.number().integer().defined(),
        targetBlockTimeInSeconds: yup.number().integer().defined(),
        maxSyncedAgeBlocks: yup.number().integer().defined(),
        targetBucketTimeInSeconds: yup.number().integer().defined(),
        maxBlockSizeBytes: yup.number().integer().defined(),
      })
      .defined(),
  })
  .defined()
