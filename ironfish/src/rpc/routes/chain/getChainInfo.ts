/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { GENESIS_BLOCK_SEQUENCE } from '../../../consensus'
import { BlockHashSerdeInstance } from '../../../serde'
import { ApiNamespace, router } from '../router'

export type BlockIdentifier = { index: string; hash: string }

export interface ChainInfo {
  currentBlockIdentifier: BlockIdentifier
  genesisBlockIdentifier: BlockIdentifier
  oldestBlockIdentifier: BlockIdentifier
  currentBlockTimestamp: number
}

export type GetChainInfoRequest = Record<string, never> | undefined
export type GetChainInfoResponse = ChainInfo

export const GetChainInfoRequestSchema: yup.MixedSchema<GetChainInfoRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const GetChainInfoResponseSchema: yup.ObjectSchema<GetChainInfoResponse> = yup
  .object({
    currentBlockIdentifier: yup
      .object({ index: yup.string().defined(), hash: yup.string().defined() })
      .defined(),
    genesisBlockIdentifier: yup
      .object({ index: yup.string().defined(), hash: yup.string().defined() })
      .defined(),
    oldestBlockIdentifier: yup
      .object({ index: yup.string().defined(), hash: yup.string().defined() })
      .defined(),
    currentBlockTimestamp: yup.number().defined(),
  })
  .defined()

/**
 * Get current, heaviest and genesis block identifiers
 */
router.register<typeof GetChainInfoRequestSchema, GetChainInfoResponse>(
  `${ApiNamespace.chain}/getChainInfo`,
  GetChainInfoRequestSchema,
  (request, node): void => {
    Assert.isNotNull(node.chain.genesis, 'no genesis')

    const latestHeader = node.chain.latest
    const heaviestHeader = node.chain.head

    const oldestBlockIdentifier = {} as BlockIdentifier
    if (heaviestHeader) {
      oldestBlockIdentifier.index = heaviestHeader.sequence.toString()
      oldestBlockIdentifier.hash = BlockHashSerdeInstance.serialize(heaviestHeader.hash)
    }

    let currentBlockTimestamp = Number()
    const currentBlockIdentifier = {} as BlockIdentifier
    if (latestHeader) {
      currentBlockTimestamp = Number(latestHeader.timestamp)
      currentBlockIdentifier.index = latestHeader.sequence.toString()
      currentBlockIdentifier.hash = BlockHashSerdeInstance.serialize(latestHeader.hash)
    }

    const genesisBlockIdentifier = {} as BlockIdentifier
    genesisBlockIdentifier.index = GENESIS_BLOCK_SEQUENCE.toString()
    genesisBlockIdentifier.hash = BlockHashSerdeInstance.serialize(node.chain.genesis.hash)

    request.end({
      currentBlockIdentifier,
      oldestBlockIdentifier,
      genesisBlockIdentifier,
      currentBlockTimestamp,
    })
  },
)
