/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

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

router.register<typeof GetAccountStatusRequestSchema, GetAccountStatusResponse>(
  `${ApiNamespace.wallet}/getAccountsStatus`,
  GetAccountStatusRequestSchema,
  async (request, node): Promise<void> => {
    const headHashes = new Map<string, Buffer | null>()
    for await (const { accountId, head } of node.wallet.walletDb.loadHeads()) {
      headHashes.set(accountId, head?.hash ?? null)
    }
    const accountsInfo: GetAccountStatusResponse['accounts'] = []
    for (const account of node.wallet.listAccounts()) {
      const headHash = headHashes.get(account.id)
      const blockHeader = headHash
        ? await node.chain.blockchainDb.getBlockHeader(headHash)
        : null
      const headInChain = !!blockHeader
      const headSequence = blockHeader?.sequence || 'NULL'
      accountsInfo.push({
        name: account.name,
        id: account.id,
        headHash: headHash ? headHash.toString('hex') : 'NULL',
        headInChain: headInChain,
        sequence: headSequence,
      })
    }

    request.end({ accounts: accountsInfo })
  },
)
