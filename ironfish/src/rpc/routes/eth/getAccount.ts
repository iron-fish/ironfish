/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address, bytesToHex } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { RpcNotFoundError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'
import { ethBlockRefToBlock } from './util'

export type GetAccountRequest = [string, string]

export type GetAccountResponse = {
  codeHash: string
  storageRoot: string
  balance: string
  nonce: string
}

export const GetAccountRequestSchema: yup.MixedSchema<GetAccountRequest> = yup
  .mixed<[string, string]>()
  .defined()

export const GetAccountResponseSchema: yup.ObjectSchema<GetAccountResponse> = yup
  .object({
    codeHash: yup.string().defined(),
    storageRoot: yup.string().defined(),
    balance: yup.string().defined(),
    nonce: yup.string().defined(),
  })
  .defined()

registerEthRoute<typeof GetAccountRequestSchema, GetAccountResponse>(
  'eth_getAccount',
  `${ApiNamespace.eth}/getAccount`,
  GetAccountRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const [addr, blockRef] = request.data
    const address = Address.fromString(addr)

    const block = await ethBlockRefToBlock(blockRef, node.chain)

    if (!block) {
      throw new RpcNotFoundError(`No block found with reference ${blockRef}`)
    }

    const account = await node.chain.evm.getAccount(address, block.header.stateCommitment)
    if (!account) {
      return request.end({
        codeHash: '',
        storageRoot: '',
        balance: '0',
        nonce: '0',
      })
    }

    request.end({
      codeHash: bytesToHex(account.codeHash),
      storageRoot: bytesToHex(account.storageRoot),
      balance: CurrencyUtils.renderOre(account.balance),
      nonce: account.nonce.toString(),
    })
  },
)
