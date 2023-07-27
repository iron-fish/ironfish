/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { HeadValue } from '../../../wallet/walletdb/headValue'
import { ApiNamespace, routes } from '../router'

export type GetAccountStatusRequest = { account?: string }

export type GetAccountStatusResponse = {
  accounts: Array<{
    name: string
    id: string
    headHash: string
    headInChain: boolean
    sequence: string | number
  }>
}

export const GetAccountStatusRequestSchema: yup.ObjectSchema<GetAccountStatusRequest> = yup
  .object({})
  .defined()

export const GetAccountStatusResponseSchema: yup.ObjectSchema<GetAccountStatusResponse> = yup
  .object({
    accounts: yup
      .array(
        yup
          .object({
            name: yup.string().defined(),
            id: yup.string().defined(),
            headHash: yup.string().defined(),
            headInChain: yup.boolean().defined(),
            sequence: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetAccountStatusRequestSchema, GetAccountStatusResponse>(
  `${ApiNamespace.wallet}/getAccountsStatus`,
  GetAccountStatusRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    const heads = new Map<string, HeadValue | null>()
    for await (const { accountId, head } of node.wallet.walletDb.loadHeads()) {
      heads.set(accountId, head)
    }

    const accountsInfo: GetAccountStatusResponse['accounts'] = []
    for (const account of node.wallet.listAccounts()) {
      const head = heads.get(account.id)
      const blockResponse = head?.hash
        ? await node.wallet.nodeClient.chain.getBlock({
            hash: head.hash.toString('hex'),
          })
        : null

      accountsInfo.push({
        name: account.name,
        id: account.id,
        headHash: head?.hash.toString('hex') || 'NULL',
        headInChain: !!blockResponse?.content.block,
        sequence: head?.sequence || 'NULL',
      })
    }

    request.end({ accounts: accountsInfo })
  },
)
