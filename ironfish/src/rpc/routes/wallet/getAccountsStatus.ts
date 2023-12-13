/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { HeadValue } from '../../../wallet/walletdb/headValue'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type GetAccountsStatusRequest = Record<string, never> | undefined

export type GetAccountsStatusResponse = {
  accounts: {
    name: string
    id: string
    headHash: string
    headInChain?: boolean
    sequence: string | number
    viewOnly: boolean
  }[]
}

export const GetAccountsStatusRequestSchema: yup.ObjectSchema<GetAccountsStatusRequest> = yup
  .object<Record<string, never>>({})
  .notRequired()
  .default({})

export const GetAccountsStatusResponseSchema: yup.ObjectSchema<GetAccountsStatusResponse> = yup
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
            viewOnly: yup.boolean().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetAccountsStatusRequestSchema, GetAccountsStatusResponse>(
  `${ApiNamespace.wallet}/getAccountsStatus`,
  GetAccountsStatusRequestSchema,
  async (request, node): Promise<void> => {
    const heads = new Map<string, HeadValue | null>()
    AssertHasRpcContext(request, node, 'wallet')

    for await (const { accountId, head } of node.wallet.walletDb.loadHeads()) {
      heads.set(accountId, head)
    }

    const accountsInfo: GetAccountsStatusResponse['accounts'] = []
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
        viewOnly: !account.isSpendingAccount(),
      })
    }

    request.end({ accounts: accountsInfo })
  },
)
