/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { HeadValue } from '../../../wallet/walletdb/headValue'
import { ApiNamespace, routes } from '../router'

export type GetAccountStatusRequest = { account?: string }

export type GetAccountStatusResponse = {
  accounts: Array<{
    name: string
    id: string
    headHash: string
    headInChain?: boolean
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
            headInChain: yup.boolean().optional(),
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
  async (request, node): Promise<void> => {
    const heads = new Map<string, HeadValue | null>()
    for await (const { accountId, head } of node.wallet.walletDb.loadHeads()) {
      heads.set(accountId, head)
    }

    const accountsInfo: GetAccountStatusResponse['accounts'] = []
    for (const account of node.wallet.listAccounts()) {
      const head = heads.get(account.id)

      let headInChain = undefined
      if (node.wallet.nodeClient) {
        headInChain = head?.hash ? await node.wallet.chainHasBlock(head.hash) : false
      }

      accountsInfo.push({
        name: account.name,
        id: account.id,
        headHash: head?.hash.toString('hex') || 'NULL',
        headInChain,
        sequence: head?.sequence || 'NULL',
      })
    }

    request.end({ accounts: accountsInfo })
  },
)
