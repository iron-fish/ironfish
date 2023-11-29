/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * NOTE: This endpoint will be deprecated in favor of `POST /wallet/useAccount` because
 * this endpoint does not follow the convention that all of our endpoints should follow which
 * is the verbObject naming convention. For example, `POST /wallet/burnAsset` burns an asset.
 */

import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RemoveAccountRequestSchema, RemoveAccountResponse } from './removeAccount'
import { getAccount } from './utils'

routes.register<typeof RemoveAccountRequestSchema, RemoveAccountResponse>(
  `${ApiNamespace.wallet}/remove`,
  RemoveAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)

    if (!request.data.confirm) {
      if (!(await context.wallet.isAccountUpToDate(account))) {
        request.end({ needsConfirm: true })
        return
      }

      const balances = await account.getUnconfirmedBalances()

      for (const [_, { unconfirmed }] of balances) {
        if (unconfirmed !== 0n) {
          request.end({ needsConfirm: true })
          return
        }
      }
    }
    await context.wallet.removeAccountByName(account.name)
    if (request.data.wait) {
      await context.wallet.forceCleanupDeletedAccounts()
    }
    request.end({})
  },
)
