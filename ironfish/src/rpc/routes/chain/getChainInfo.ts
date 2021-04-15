/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GENESIS_BLOCK_SEQUENCE } from '../../../consensus'
import { Assert } from '../../../assert'
import * as yup from 'yup'

import { ApiNamespace, router } from '../router'

export type GetChainInfoRequest = Record<string, never>
export type BlockIdentifier = { index: string; hash: string }

export interface ChainInfo {
  currentBlockIdentifier: BlockIdentifier
  genesisBlockIdentifier: BlockIdentifier
  oldestBlockIdentifier: BlockIdentifier
  currentBlockTimestamp: number
}
export type GetChainInfoResponse = ChainInfo

export const GetChainInfoRequestSchema: yup.ObjectSchema<GetChainInfoRequest> = yup
  .object<Record<string, never>>()
  .noUnknown()
  .defined()

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
  async (request, node): Promise<void> => {
    const latestHeader = await node.chain.getLatestHead()
    const heaviestHeader = await node.chain.getHeaviestHead()
    const oldestBlockIdentifier = {} as BlockIdentifier
    if (heaviestHeader) {
      oldestBlockIdentifier.index = heaviestHeader.sequence.toString()
      oldestBlockIdentifier.hash = node.chain.blockHashSerde.serialize(heaviestHeader.hash)
    }

    let currentBlockTimestamp = Number()
    const currentBlockIdentifier = {} as BlockIdentifier
    if (latestHeader) {
      currentBlockTimestamp = Number(latestHeader.timestamp)
      currentBlockIdentifier.index = latestHeader.sequence.toString()
      currentBlockIdentifier.hash = node.chain.blockHashSerde.serialize(latestHeader.hash)
    }

    const genesisBlockHash = await node.chain.getGenesisHash()
    Assert.isNotNull(genesisBlockHash)

    const genesisBlockIdentifier = {} as BlockIdentifier
    genesisBlockIdentifier.index = GENESIS_BLOCK_SEQUENCE.toString()
    genesisBlockIdentifier.hash = node.chain.blockHashSerde.serialize(genesisBlockHash)

    request.end({
      currentBlockIdentifier,
      oldestBlockIdentifier,
      genesisBlockIdentifier,
      currentBlockTimestamp,
    })
  },
)
