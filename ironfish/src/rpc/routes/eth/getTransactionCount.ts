/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address, hexToBytes } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { EthUtils } from '../../../utils'
import { registerEthRoute } from '../eth/ethRouter'
import { ApiNamespace } from '../namespaces'
import { ethBlockRefToBlock } from './util'

export type GetTransactionCountRequest = [string, string]

export const GetTransactionCountRequestSchema: yup.MixedSchema<GetTransactionCountRequest> = yup
  .mixed<[string, string]>()
  .defined()

export type GetTransactionCountResponse = string

export const GetTransactionCountResponseSchema: yup.StringSchema<GetTransactionCountResponse> =
  yup.string().defined()

registerEthRoute<typeof GetTransactionCountRequestSchema, GetTransactionCountResponse>(
  `eth_getTransactionCount`,
  `${ApiNamespace.eth}/getTransactionCount`,
  GetTransactionCountRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const [addressHex, blockRef] = request.data
    // TODO handle pending transactions
    const block = await ethBlockRefToBlock(blockRef, node.chain)

    const stateManager = await node.chain.blockchainDb.stateManager.withStateRoot(
      block?.header.stateCommitment,
    )

    const account = await stateManager.getAccount(new Address(hexToBytes(addressHex)))
    if (account === undefined) {
      request.end('0x0')
      return
    }
    request.end(EthUtils.numToHex(account.nonce))
  },
)
