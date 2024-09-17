/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address, bytesToHex, hexToBytes } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { EthUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'
import { ethBlockRefToBlock } from './util'

export type GetStorageAtRequest = [string, string, string]

export const GetStorageAtRequestSchema: yup.MixedSchema<GetStorageAtRequest> = yup
  .mixed<[string, string, string]>()
  .defined()

export type GetStorageAtResponse = string

export const GetStorageAtResponseSchema: yup.StringSchema<GetStorageAtResponse> = yup
  .string()
  .defined()

registerEthRoute<typeof GetStorageAtRequestSchema, GetStorageAtResponse>(
  `eth_getStorageAt`,
  `${ApiNamespace.eth}/getStorageAt`,
  GetStorageAtRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const [addressHex, position, blockRef] = request.data

    // TODO handle pending transactions
    const block = await ethBlockRefToBlock(blockRef, node.chain)

    const stateManager = await node.chain.blockchainDb.stateManager.withStateRoot(
      block?.header.stateCommitment,
    )
    const code = bytesToHex(
      await stateManager.getContractStorage(
        new Address(hexToBytes(addressHex)),
        Buffer.from(EthUtils.remove0x(position), 'hex'),
      ),
    )
    request.end(code)
  },
)
