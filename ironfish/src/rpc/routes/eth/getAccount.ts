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
import { routes } from '../router'

export type GetAccountRequest = {
  address: string
  blockReference: string
}

export type GetAccountResponse = {
  codeHash: string
  storageRoot: string
  balance: string
  nonce: string
}

export const GetAccountRequestSchema: yup.ObjectSchema<GetAccountRequest> = yup
  .object({
    address: yup.string().defined().trim(),
    blockReference: yup.string().defined().trim(),
  })
  .defined()

export const GetAccountResponseSchema: yup.ObjectSchema<GetAccountResponse> = yup
  .object({
    codeHash: yup.string().defined(),
    storageRoot: yup.string().defined(),
    balance: yup.string().defined(),
    nonce: yup.string().defined(),
  })
  .defined()

routes.register<typeof GetAccountRequestSchema, GetAccountResponse>(
  `${ApiNamespace.eth}/getAccount`,
  GetAccountRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const address = Address.fromString(request.data.address)

    // TODO(hughy): parse blockReference as hex string or as tag (e.g., 'latest')
    const blockNumber = Number(request.data.blockReference)
    const block = await node.chain.getBlockAtSequence(blockNumber)
    if (!block) {
      throw new RpcNotFoundError(`No block found with reference ${request.data.blockReference}`)
    }

    const account = await node.chain.evm.getAccount(address, block.header.stateCommitment)
    if (!account) {
      throw new RpcNotFoundError(`No account found with address ${request.data.address}`)
    }

    request.end({
      codeHash: bytesToHex(account.codeHash),
      storageRoot: bytesToHex(account.storageRoot),
      balance: CurrencyUtils.renderOre(account.balance),
      nonce: account.nonce.toString(),
    })
  },
)
