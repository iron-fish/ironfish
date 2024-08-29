/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { registerEthRoute } from '../eth/ethRouter'
import { ApiNamespace } from '../namespaces'

export type AccountsRequest = undefined

export const AccountsRequestSchema: yup.MixedSchema<AccountsRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export type AccountsResponse = string[]

export const AccountsResponseSchema: yup.MixedSchema<AccountsResponse> = yup
  .mixed<AccountsResponse>()
  .defined()

registerEthRoute<typeof AccountsRequestSchema, AccountsResponse>(
  `eth_accounts`,
  `${ApiNamespace.eth}/accounts`,
  AccountsRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    const addresses: string[] = []
    const accounts = node.wallet.listAccounts()
    for (const account of accounts) {
      if (account.ethAddress) {
        addresses.push(account.ethAddress)
      }
    }
    request.end(addresses)
  },
)
