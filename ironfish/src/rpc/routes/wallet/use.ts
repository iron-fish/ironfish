/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { UseAccountRequestSchema, UseAccountResponse } from './useAccount'
import { getAccount } from './utils'

/**
 * NOTE: This endpoint will be deprecated in favor of `POST /wallet/useAccount` because
 * this endpoint does not follow the convention that all of our endpoints should follow which
 * is the verbObject naming convention. For example, `POST /wallet/burnAsset` burns an asset.
 */

routes.register<typeof UseAccountRequestSchema, UseAccountResponse>(
  `${ApiNamespace.wallet}/use`,
  UseAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    await context.wallet.setDefaultAccount(account.name)
    request.end()
  },
)
